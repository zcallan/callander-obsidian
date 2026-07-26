import { TFile, TFolder, normalizePath } from "obsidian";
import type FriendTracker from "@/main";
import type { SomedayDay } from "@/constants";
import { SOMEDAY_DAYS } from "@/constants";
import type { SomedayInfo, SomedaySubIdea } from "@/types";

/** The editable fields of a Someday — used for both create and update. */
export interface SomedayFields {
	name: string;
	date?: string;
	timeframe?: string;
	days?: SomedayDay[];
	cost?: number | null;
	location?: string;
	notes?: string;
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
			`${this.plugin.settings.contactsFolder}/Somedays`
		);
	}

	isSomedayFile(path: string): boolean {
		return (
			path.startsWith(this.getSomedaysFolderPath() + "/") &&
			path.endsWith(".md")
		);
	}

	/** Candidate weekdays, tolerant of legacy/garbage values. */
	static daysOf(metadata: any): SomedayDay[] {
		const raw = metadata?.days;
		if (!Array.isArray(raw)) return [];
		return raw
			.map((d: any) => String(d).toLowerCase())
			.filter((d: string): d is SomedayDay => VALID_DAYS.has(d));
	}

	/** Sub-ideas; legacy plain strings read as unchecked children. */
	static subIdeasOf(metadata: any): SomedaySubIdea[] {
		if (!Array.isArray(metadata?.subIdeas)) return [];
		return metadata.subIdeas
			.map((s: any) =>
				typeof s === "string"
					? { text: s, done: false }
					: { text: s?.text ?? "", done: !!s?.done }
			)
			.filter((s: SomedaySubIdea) => s.text.length > 0);
	}

	static costOf(metadata: any): number | null {
		return typeof metadata?.cost === "number" ? metadata.cost : null;
	}

	/** Build a SomedayInfo from a file's cached frontmatter. */
	private toInfo(file: TFile): SomedayInfo {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		return {
			file,
			name: fm?.name ? String(fm.name) : file.basename,
			date: fm?.date ? String(fm.date) : "",
			timeframe: fm?.timeframe ? String(fm.timeframe) : "",
			days: SomedayOperations.daysOf(fm),
			cost: SomedayOperations.costOf(fm),
			location: fm?.location ? String(fm.location) : "",
			notes: fm?.notes ? String(fm.notes) : "",
			subIdeas: SomedayOperations.subIdeasOf(fm),
			status: fm?.status ? String(fm.status) : "open",
			convertedTo: fm?.convertedTo ? String(fm.convertedTo) : "",
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
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const set = (key: string, value: unknown) => {
				if (value === undefined || value === null || value === "") {
					delete fm[key];
				} else {
					fm[key] = value;
				}
			};
			if (patch.name !== undefined) fm.name = patch.name;
			if (patch.date !== undefined) set("date", patch.date);
			if (patch.timeframe !== undefined) set("timeframe", patch.timeframe);
			if (patch.days !== undefined)
				set("days", patch.days.length ? patch.days : undefined);
			// cost: a numeric 0 is a legitimate "free" estimate, so keep it
			if (patch.cost !== undefined)
				set("cost", patch.cost === null ? undefined : patch.cost);
			if (patch.location !== undefined) set("location", patch.location);
			if (patch.notes !== undefined) set("notes", patch.notes);
		});
	}

	async addSubIdea(file: TFile, text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed) return;
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm.subIdeas = [
				...SomedayOperations.subIdeasOf(fm),
				{ text: trimmed, done: false },
			];
		});
	}

	async toggleSubIdea(file: TFile, index: number): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const list = SomedayOperations.subIdeasOf(fm);
			if (index >= 0 && index < list.length) {
				list[index] = { ...list[index], done: !list[index].done };
			}
			fm.subIdeas = list;
		});
	}

	async removeSubIdea(file: TFile, index: number): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const list = SomedayOperations.subIdeasOf(fm);
			if (index >= 0 && index < list.length) list.splice(index, 1);
			if (list.length > 0) fm.subIdeas = list;
			else delete fm.subIdeas;
		});
	}

	async setStatus(file: TFile, status: "open" | "done"): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm.status = status;
		});
	}

	/** Record the Plan a Someday became (kept as a breadcrumb when not removed). */
	async markConverted(file: TFile, planPath: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm.convertedTo = planPath;
		});
	}

	async deleteSomeday(file: TFile): Promise<void> {
		await this.app.fileManager.trashFile(file);
	}
}
