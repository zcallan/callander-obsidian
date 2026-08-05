import { TFile, TFolder, normalizePath } from "obsidian";
import type FriendTracker from "@/main";
import type {
	SomedayCompany,
	SomedayDay,
	SomedayTime,
	SomedayType,
} from "@/constants";
import {
	SOMEDAY_DAYS,
	SOMEDAY_SEASONS,
	SOMEDAY_TIMES,
	somedayType,
} from "@/constants";
import type { SomedayInfo, SomedaySubIdea } from "@/types";
import { asArray, fieldOf, toText } from "@/utils/fm";
import { todayISO } from "@/utils/flexdate";
import { metadataSettled } from "@/utils/metadataSettled";

/** The editable fields of a Someday — used for both create and update. */
export interface SomedayFields {
	name: string;
	date?: string;
	seasons?: string[];
	days?: SomedayDay[];
	times?: SomedayTime[];
	/** Hard deadline, ISO YYYY-MM-DD */
	finalDate?: string;
	cost?: number | null;
	notes?: string;
	company?: SomedayCompany | "";
	type?: SomedayType | "";
	/** Wikilinks to real contacts, e.g. ["[[Callan]]"] — same shape as a
	 * plan's members. */
	people?: string[];
}

const VALID_DAYS = new Set<string>(SOMEDAY_DAYS.map((d) => d.id));
const VALID_TIMES = new Set<string>(SOMEDAY_TIMES.map((t) => t.id));

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

	/**
	 * Every write goes through here so the file's `updated` stamp stays
	 * true — and so every caller waits for the metadata cache to catch up
	 * before resolving. `getSomedays()` reads through that cache, and the
	 * dashboard and Somedays page both refresh the moment a modal closes;
	 * without waiting, that refresh can land before the write it's meant
	 * to be showing is actually indexed, and render the old values.
	 *
	 * Pass `until` whenever the caller can say what the write should end
	 * up looking like — "any re-index happened" isn't precise enough when
	 * `createSomeday` writes a file twice in quick succession (create,
	 * then this), since the first write's own event can satisfy a vague
	 * wait before the second write's fields are indexed.
	 */
	private async writeSomeday(
		file: TFile,
		fn: (fm: Record<string, unknown>) => void,
		until?: (fm: Record<string, unknown> | undefined) => boolean
	): Promise<void> {
		const settled = metadataSettled(this.app, file.path, { until });
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fn(fm);
				fm.updated = todayISO();
			}
		);
		await settled;
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

	/** Time-of-day windows; empty means any time. A stored "any" is dropped
	 * here rather than kept — absence is the single representation of
	 * "unconstrained", so nothing downstream has to handle both. */
	static timesOf(metadata: unknown): SomedayTime[] {
		return asArray(fieldOf(metadata, "times"))
			.map((t) => String(t).toLowerCase())
			.filter((t): t is SomedayTime => VALID_TIMES.has(t));
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

	/** Suggested-people wikilinks, tolerant of whatever shape is stored. */
	static peopleOf(metadata: unknown): string[] {
		return asArray(fieldOf(metadata, "people")).map(String);
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
			times: SomedayOperations.timesOf(fm),
			finalDate: str("finalDate"),
			cost: SomedayOperations.costOf(fm),
			notes: str("notes"),
			subIdeas: SomedayOperations.subIdeasOf(fm),
			status: str("status") || "open",
			convertedTo: str("convertedTo"),
			company: company === "solo" || company === "group" ? company : "",
			type: somedayType(str("type"))?.id ?? "",
			people: SomedayOperations.peopleOf(fm),
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
		const created = todayISO();
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

	/**
	 * Write the editable fields; empty/blank values remove the key.
	 *
	 * `resolved()` is the one place that decides what "empty" means for a
	 * given value (used both to decide what to write, and — in `expected`
	 * — what the cache should read back as once it has); keeping that to a
	 * single function is what stops the two from quietly drifting apart.
	 */
	async updateSomeday(
		file: TFile,
		patch: Partial<SomedayFields>
	): Promise<void> {
		const resolved = (value: unknown): unknown => {
			if (value === undefined || value === null || value === "") {
				return undefined;
			}
			if (Array.isArray(value) && value.length === 0) return undefined;
			return value;
		};
		const sameArray = (a: unknown, b: unknown[]) =>
			Array.isArray(a) &&
			a.length === b.length &&
			a.every((v, i) => v === b[i]);

		const expected: Record<string, unknown> = {};
		if (patch.name !== undefined) expected.name = patch.name;
		if (patch.date !== undefined) expected.date = resolved(patch.date);
		if (patch.seasons !== undefined) {
			expected.seasons = resolved(patch.seasons);
		}
		if (patch.days !== undefined) expected.days = resolved(patch.days);
		if (patch.times !== undefined) expected.times = resolved(patch.times);
		if (patch.finalDate !== undefined) {
			expected.finalDate = resolved(patch.finalDate);
		}
		if (patch.cost !== undefined) expected.cost = resolved(patch.cost);
		if (patch.notes !== undefined) expected.notes = resolved(patch.notes);
		if (patch.company !== undefined) {
			expected.company = resolved(patch.company);
		}
		if (patch.type !== undefined) expected.type = resolved(patch.type);
		if (patch.people !== undefined) expected.people = resolved(patch.people);

		await this.writeSomeday(
			file,
			(fm) => {
				const set = (key: string, value: unknown) => {
					const v = resolved(value);
					if (v === undefined) delete fm[key];
					else fm[key] = v;
				};
				if (patch.name !== undefined) fm.name = patch.name;
				if (patch.date !== undefined) set("date", patch.date);
				if (patch.seasons !== undefined) {
					set("seasons", patch.seasons);
					delete fm.timeframe; // retire the legacy single-season key
				}
				if (patch.days !== undefined) set("days", patch.days);
				if (patch.times !== undefined) set("times", patch.times);
				if (patch.finalDate !== undefined) {
					set("finalDate", patch.finalDate);
				}
				// A numeric 0 is a legitimate "free" estimate, not "unset" —
				// resolved() only treats null/undefined/"" as removal.
				if (patch.cost !== undefined) set("cost", patch.cost);
				if (patch.notes !== undefined) set("notes", patch.notes);
				if (patch.company !== undefined) set("company", patch.company);
				if (patch.type !== undefined) set("type", patch.type);
				if (patch.people !== undefined) set("people", patch.people);
			},
			(fm) =>
				!!fm &&
				Object.entries(expected).every(([key, value]) =>
					Array.isArray(value)
						? sameArray(fm[key], value)
						: fm[key] === value
				)
		);
	}

	private currentFrontmatter(file: TFile): unknown {
		return this.app.metadataCache.getFileCache(file)?.frontmatter;
	}

	async addSubIdea(file: TFile, text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed) return;
		const before = SomedayOperations.subIdeasOf(
			this.currentFrontmatter(file)
		).length;
		await this.writeSomeday(
			file,
			(fm) => {
				fm.subIdeas = [
					...SomedayOperations.subIdeasOf(fm),
					{ text: trimmed, done: false },
				];
			},
			(fm) => SomedayOperations.subIdeasOf(fm).length === before + 1
		);
	}

	async toggleSubIdea(file: TFile, index: number): Promise<void> {
		const before = SomedayOperations.subIdeasOf(
			this.currentFrontmatter(file)
		)[index];
		await this.writeSomeday(
			file,
			(fm) => {
				const list = SomedayOperations.subIdeasOf(fm);
				if (index >= 0 && index < list.length) {
					list[index] = { ...list[index], done: !list[index].done };
				}
				fm.subIdeas = list;
			},
			before
				? (fm) =>
						SomedayOperations.subIdeasOf(fm)[index]?.done ===
						!before.done
				: undefined
		);
	}

	async removeSubIdea(file: TFile, index: number): Promise<void> {
		const list = SomedayOperations.subIdeasOf(this.currentFrontmatter(file));
		const before = list.length;
		const valid = index >= 0 && index < before;
		await this.writeSomeday(
			file,
			(fm) => {
				const list = SomedayOperations.subIdeasOf(fm);
				if (index >= 0 && index < list.length) list.splice(index, 1);
				if (list.length > 0) fm.subIdeas = list;
				else delete fm.subIdeas;
			},
			valid
				? (fm) => SomedayOperations.subIdeasOf(fm).length === before - 1
				: undefined
		);
	}

	async setStatus(file: TFile, status: "open" | "done"): Promise<void> {
		await this.writeSomeday(
			file,
			(fm) => {
				fm.status = status;
			},
			(fm) => fm?.status === status
		);
	}

	/** Record the Plan a Someday became (kept as a breadcrumb when not removed). */
	async markConverted(file: TFile, planPath: string): Promise<void> {
		await this.writeSomeday(
			file,
			(fm) => {
				fm.convertedTo = planPath;
			},
			(fm) => fm?.convertedTo === planPath
		);
	}

	async deleteSomeday(file: TFile): Promise<void> {
		await this.app.fileManager.trashFile(file);
	}
}
