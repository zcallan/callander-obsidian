import { TFile, normalizePath } from "obsidian";
import type { ServiceHost } from "@/services/host";
import type { PlanInfo, PlanItem, PlanList } from "@/types";
import { asArray, fieldOf, fieldText, toText } from "@/utils/fm";
import { todayISO } from "@/utils/flexdate";
import {
	ensureFolder,
	markdownFilesIn,
	uniqueNotePath,
} from "@/services/vaultFiles";
import { safeFileName } from "@/utils/fileName";
import {
	bringOf,
	estimate,
	itemsOf,
	membersOf,
	quickIdeaCategoriesOf,
	quickIdeasOf,
	simpleListOf,
	stayCategoriesOf,
} from "@/utils/planFields";
import {
	groupQuickIdeas,
	timelineOf,
	undatedIdeaEntries,
} from "@/utils/planTimeline";
import {
	PAGE_DRAFTS_SECTION,
	type LedgerDraft,
	upsertDraftsSection,
} from "@/utils/draftsMarkdown";
import { joinFrontmatter, splitFrontmatter } from "@/utils/markdownSection";

export class PlanOperations {
	// The readers live in utils/planFields and utils/planTimeline; these
	// aliases keep the existing PlanOperations.x call sites working.
	static quickIdeasOf = quickIdeasOf;
	static quickIdeaCategoriesOf = quickIdeaCategoriesOf;
	static stayCategoriesOf = stayCategoriesOf;
	static itemsOf = itemsOf;
	static simpleListOf = simpleListOf;
	static membersOf = membersOf;
	static bringOf = bringOf;
	static estimate = estimate;
	static groupQuickIdeas = groupQuickIdeas;
	static undatedIdeaEntries = undatedIdeaEntries;
	static timelineOf = timelineOf;

	constructor(private plugin: ServiceHost) {}

	private get app() {
		return this.plugin.app;
	}

	getPlansFolderPath(): string {
		return normalizePath(`${this.plugin.settings.baseFolder}/Plans`);
	}

	isPlanFile(path: string): boolean {
		return (
			path.startsWith(this.getPlansFolderPath() + "/") &&
			path.endsWith(".md")
		);
	}

	/** All plans, straight from the metadata cache — zero file I/O */
	getPlans(): PlanInfo[] {
		return markdownFilesIn(this.app, this.getPlansFolderPath())
			.map((file) => {
				const fm: unknown =
					this.app.metadataCache.getFileCache(file)?.frontmatter;
				const str = (key: string) => fieldText(fm, key);
				return {
					file,
					name: str("name") || file.basename,
					date: str("date"),
					endDate: str("endDate"),
					location: str("location"),
					status: str("status") || "planning",
					created: str("created"),
					updated: str("updated"),
					items: PlanOperations.itemsOf(fm),
					members: PlanOperations.membersOf(fm),
					hiddenFromUpcoming:
						fieldOf(fm, "hiddenFromUpcoming") === true,
					hiddenFromEvents:
						fieldOf(fm, "hiddenFromEvents") === true,
				};
			});
	}

	/**
	 * Drop a person from every plan's `members`/`unconfirmedMembers` once
	 * they're deleted — otherwise a plan keeps its own copy of the wikilink
	 * forever, and "Who's in" renders it as bare, unremovable text once the
	 * link stops resolving to anything (see `planMemberChips` in
	 * ContactPageView, which falls back to the raw linktext rather than
	 * dropping an entry it can't resolve). Call this *before* trashing the
	 * file — the link only resolves to it, and so only matches it here,
	 * while the file still exists.
	 */
	async removePersonFromPlans(file: TFile): Promise<void> {
		const plans = markdownFilesIn(this.app, this.getPlansFolderPath());
		for (const plan of plans) {
			const resolves = (raw: unknown) =>
				this.app.metadataCache.getFirstLinkpathDest(
					toText(raw).replace(/^\[\[|\]\]$/g, ""),
					plan.path
				)?.path === file.path;
			const fm = this.app.metadataCache.getFileCache(plan)?.frontmatter;
			const hasEntry = (key: string) =>
				asArray(fieldOf(fm, key)).some(resolves);
			if (!hasEntry("members") && !hasEntry("unconfirmedMembers")) continue;
			await this.app.fileManager.processFrontMatter(plan, (data) => {
				const fm = data as Record<string, unknown>;
				for (const key of ["members", "unconfirmedMembers"]) {
					const next = asArray(fieldOf(fm, key)).filter(
						(raw) => !resolves(raw)
					);
					if (next.length > 0) fm[key] = next;
					else delete fm[key];
				}
			});
		}
	}

	async createPlan(
		name: string,
		date: string,
		location = "",
		endDate = ""
	): Promise<TFile> {
		const folderPath = this.getPlansFolderPath();
		await ensureFolder(this.app, folderPath);
		const path = uniqueNotePath(this.app, folderPath, safeFileName(name), {
			separator: " ",
		});
		const loc = location.trim()
			? `location: ${JSON.stringify(location.trim())}\n`
			: "";
		const end = endDate.trim() ? `endDate: ${endDate.trim()}\n` : "";
		return await this.app.vault.create(
			path,
			`---\nname: ${JSON.stringify(
				name
			)}\ndate: ${date}\n${end}${loc}status: planning\ncreated: ${todayISO()}\nupdated: ${todayISO()}\n---\n`
		);
	}

	/** Plan writes go through here so the file's `updated` stamp stays true —
	 * all but removePersonFromPlans, which writes directly and leaves
	 * `updated` as it was. */
	/**
	 * Keep a plan's file name in step with its name (the same sanitising
	 * as plan creation), in the folder it's in. Nothing happens when the
	 * name already matches.
	 */
	async renamePlan(file: TFile, name: string): Promise<void> {
		if (!file.parent) return;
		const newPath = `${file.parent.path}/${safeFileName(name, "Plan")}.md`;
		if (newPath !== file.path) {
			await this.app.fileManager.renameFile(file, newPath);
		}
	}

	/** Send the plan note to the trash, per the user's trash setting. */
	async deletePlan(file: TFile): Promise<void> {
		await this.app.fileManager.trashFile(file);
	}

	/** Rewrite just the plan's own Drafts section, leaving the rest of the
	 * note — frontmatter included — exactly as it was. */
	async writeDrafts(file: TFile, drafts: LedgerDraft[]): Promise<void> {
		await this.app.vault.process(file, (content) => {
			const { frontmatter, body } = splitFrontmatter(content);
			return joinFrontmatter(
				frontmatter,
				upsertDraftsSection(body, drafts, PAGE_DRAFTS_SECTION)
			);
		});
	}

	private async writePlan(
		file: TFile,
		fn: (fm: Record<string, unknown>) => void
	): Promise<void> {
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fn(fm);
				fm.updated = todayISO();
			}
		);
	}

	/**
	 * Hide a plan from a list, or put it back.
	 *
	 * Takes one list or several so "Show again" can clear both at once from
	 * a single row action. Only the opt-out is stored: the key is deleted
	 * rather than written `false`, keeping it out of notes you'll open.
	 */
	async setHiddenFrom(
		file: TFile,
		lists: PlanList | PlanList[],
		hidden: boolean
	): Promise<void> {
		const keys = (Array.isArray(lists) ? lists : [lists]).map((list) =>
			list === "upcoming" ? "hiddenFromUpcoming" : "hiddenFromEvents"
		);
		await this.writePlan(file, (fm) => {
			for (const key of keys) {
				if (hidden) fm[key] = true;
				else delete fm[key];
			}
		});
	}

	/** Quick-capture path: append an idea without opening the plan */
	async addItem(file: TFile, item: PlanItem): Promise<void> {
		await this.writePlan(file, (fm) => {
			fm.items = [...PlanOperations.itemsOf(fm), item];
		});
	}

	/** Quick-capture path for the bring list */
	async addBringItem(file: TFile, text: string): Promise<void> {
		await this.writePlan(file, (fm) => {
			fm.bring = [...PlanOperations.bringOf(fm), { text, done: false }];
		});
	}

}
