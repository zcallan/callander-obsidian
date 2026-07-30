import { TFile, TFolder, normalizePath } from "obsidian";
import type FriendTracker from "@/main";
import type { SomedayCompany, SomedayDay } from "@/constants";
import { SOMEDAY_DAYS, SOMEDAY_SEASONS } from "@/constants";
import type { SomedayInfo, SomedaySubIdea } from "@/types";
import { asArray, fieldOf, toText } from "@/utils/fm";

/** The editable fields of a Someday — used for both create and update. */
export interface SomedayFields {
	name: string;
	date?: string;
	seasons?: string[];
	days?: SomedayDay[];
	cost?: number | null;
	notes?: string;
	company?: SomedayCompany | "";
}

const VALID_DAYS = new Set<string>(SOMEDAY_DAYS.map((d) => d.id));

/**
 * Standalone wishlist ideas ("Somedays"). One markdown note per idea, stored in
 * a Somedays/ folder alongside Plans — but deliberately lighter: no members, no
 * split costs. Mirrors PlanOperations in shape.
 */
export class SomedayOperations {
	constructor(private plugin: FriendTracker) {}

	private get app() {
		return this.plugin.app;
	}

	getSomedaysFolderPath(): string {
		return normalizePath(
			`${this.plugin.settings.baseFolder}/Somedays`
		);
	}

	isSomedayFile(path: string): boolean {
		return (
			path.startsWith(this.getSomedaysFolderPath() + "/") &&
			path.endsWith(".md")
		);
	}

	/** Candidate weekdays, tolerant of legacy/garbage values. */
	static daysOf(metadata: unknown): SomedayDay[] {
		return asArray(fieldOf(metadata, "days"))
			.map((d) => String(d).toLowerCase())
			.filter((d): d is SomedayDay => VALID_DAYS.has(d));
	}

	/** Chosen seasons; folds a legacy single `timeframe` season id. */
	static seasonsOf(metadata: unknown): string[] {
		const valid = new Set<string>(SOMEDAY_SEASONS.map((s) => s.id));
		const seasons = asArray(fieldOf(metadata, "seasons"))
			.map((s) => String(s).toLowerCase())
			.filter((s) => valid.has(s));
		const timeframe = fieldOf(metadata, "timeframe");
		if (seasons.length === 0 && valid.has(String(timeframe))) {
			return [String(timeframe)];
		}
		return seasons;
	}

	/** Sub-ideas; legacy plain strings read as unchecked children. */
	static subIdeasOf(metadata: unknown): SomedaySubIdea[] {
		return asArray(fieldOf(metadata, "subIdeas"))
			.map((s): SomedaySubIdea => {
				if (typeof s === "string") return { text: s, done: false };
				const text = fieldOf(s, "text");
				return {
					text: typeof text === "string" ? text : "",
					done: !!fieldOf(s, "done"),
				};
			})
			.filter((s) => s.text.length > 0);
	}

	static costOf(metadata: unknown): number | null {
		const cost = fieldOf(metadata, "cost");
		return typeof cost === "number" ? cost : null;
	}

	/** Build a SomedayInfo from a file's cached frontmatter. */
	private toInfo(file: TFile): SomedayInfo {
		const fm: unknown =
			this.app.metadataCache.getFileCache(file)?.frontmatter;
		const str = (key: string): string => {
			const v = fieldOf(fm, key);
			return v ? toText(v) : "";
		};
		const company = fieldOf(fm, "company");
		return {
			file,
			name: str("name") || file.basename,
			date: str("date"),
			seasons: SomedayOperations.seasonsOf(fm),
			days: SomedayOperations.daysOf(fm),
			cost: SomedayOperations.costOf(fm),
			notes: str("notes"),
			subIdeas: SomedayOperations.subIdeasOf(fm),
			status: str("status") || "open",
			convertedTo: str("convertedTo"),
			company: company === "solo" || company === "group" ? company : "",
		};
	}

	/** All somedays, straight from the metadata cache — zero file I/O. */
	getSomedays(): SomedayInfo[] {
		const folder = this.app.vault.getAbstractFileByPath(
			this.getSomedaysFolderPath()
		);
		if (!(folder instanceof TFolder)) return [];
		return folder.children
			.filter(
				(f): f is TFile => f instanceof TFile && f.extension === "md"
			)
			.map((file) => this.toInfo(file));
	}

	async createSomeday(fields: SomedayFields): Promise<TFile> {
		const folderPath = this.getSomedaysFolderPath();
		if (!this.app.vault.getAbstractFileByPath(folderPath)) {
			await this.app.vault.createFolder(folderPath);
		}
		const safeName =
			fields.name.replace(/[\\/:*?"<>|#^[\]]/g, "-").trim() || "Someday";
		let path = normalizePath(`${folderPath}/${safeName}.md`);
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(path)) {
			path = normalizePath(`${folderPath}/${safeName} ${counter++}.md`);
		}
		const pad = (n: number) => String(n).padStart(2, "0");
		const now = new Date();
		const created = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
			now.getDate()
		)}`;
		const file = await this.app.vault.create(
			path,
			`---\nkind: someday\nname: ${JSON.stringify(
				fields.name
			)}\nstatus: open\ncreated: ${created}\n---\n`
		);
		// Set the optional fields through the same path as an edit, so arrays
		// and numbers are serialized consistently.
		await this.updateSomeday(file, fields);
		return file;
	}

	/** Write the editable fields; empty/blank values remove the key. */
	async updateSomeday(
		file: TFile,
		patch: Partial<SomedayFields>
	): Promise<void> {
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				const set = (key: string, value: unknown) => {
					if (
						value === undefined ||
						value === null ||
						value === ""
					) {
						delete fm[key];
					} else {
						fm[key] = value;
					}
				};
				if (patch.name !== undefined) fm.name = patch.name;
				if (patch.date !== undefined) set("date", patch.date);
				if (patch.seasons !== undefined) {
					set(
						"seasons",
						patch.seasons.length ? patch.seasons : undefined
					);
					delete fm.timeframe; // retire the legacy single-season key
				}
				if (patch.days !== undefined)
					set("days", patch.days.length ? patch.days : undefined);
				// cost: a numeric 0 is a legitimate "free" estimate, so keep it
				if (patch.cost !== undefined)
					set("cost", patch.cost === null ? undefined : patch.cost);
				if (patch.notes !== undefined) set("notes", patch.notes);
				if (patch.company !== undefined) set("company", patch.company);
			}
		);
	}

	async addSubIdea(file: TFile, text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed) return;
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fm.subIdeas = [
					...SomedayOperations.subIdeasOf(fm),
					{ text: trimmed, done: false },
				];
			}
		);
	}

	async toggleSubIdea(file: TFile, index: number): Promise<void> {
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				const list = SomedayOperations.subIdeasOf(fm);
				if (index >= 0 && index < list.length) {
					list[index] = { ...list[index], done: !list[index].done };
				}
				fm.subIdeas = list;
			}
		);
	}

	async removeSubIdea(file: TFile, index: number): Promise<void> {
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				const list = SomedayOperations.subIdeasOf(fm);
				if (index >= 0 && index < list.length) list.splice(index, 1);
				if (list.length > 0) fm.subIdeas = list;
				else delete fm.subIdeas;
			}
		);
	}

	async setStatus(file: TFile, status: "open" | "done"): Promise<void> {
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fm.status = status;
			}
		);
	}

	/** Record the Plan a Someday became (kept as a breadcrumb when not removed). */
	async markConverted(file: TFile, planPath: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fm.convertedTo = planPath;
			}
		);
	}

	async deleteSomeday(file: TFile): Promise<void> {
		await this.app.fileManager.trashFile(file);
	}
}
