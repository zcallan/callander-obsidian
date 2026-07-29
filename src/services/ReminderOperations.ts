import { TFile, normalizePath } from "obsidian";
import type FriendTracker from "@/main";
import type { Reminder } from "@/types";
import { REMINDERS_BASENAME } from "@/constants";
import { asArray, fieldOf, isRecord, toText } from "@/utils/fm";

/** The editable fields of a reminder — used for both create and update. */
export interface ReminderFields {
	name: string;
	date?: string;
	time?: string;
	location?: string;
	link?: string;
}

/**
 * Standalone scheduled reminders, all in one Reminders.md store (like the idea
 * inbox). Surfaced on the dashboard's Upcoming section; there's no per-reminder
 * file or view.
 */
export class ReminderOperations {
	constructor(private plugin: FriendTracker) {}

	private get app() {
		return this.plugin.app;
	}

	getRemindersPath(): string {
		return normalizePath(
			`${this.plugin.settings.contactsFolder}/${REMINDERS_BASENAME}.md`
		);
	}

	async ensureFile(): Promise<TFile> {
		const path = this.getRemindersPath();
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) return existing;
		return await this.app.vault.create(
			path,
			`---\nname: ${REMINDERS_BASENAME}\n---\n`
		);
	}

	static remindersOf(metadata: unknown): Reminder[] {
		return asArray(fieldOf(metadata, "reminders"))
			.map((raw): Reminder => {
				const r = isRecord(raw) ? raw : {};
				return {
					id: toText(r.id),
					name: toText(r.name),
					...(r.date ? { date: toText(r.date) } : {}),
					...(r.time ? { time: toText(r.time) } : {}),
					...(r.location ? { location: toText(r.location) } : {}),
					...(r.link ? { link: toText(r.link) } : {}),
					status: r.status === "done" ? "done" : "open",
					...(r.created ? { created: toText(r.created) } : {}),
				};
			})
			.filter((r) => r.name.length > 0);
	}

	getReminders(): Reminder[] {
		const file = this.app.vault.getAbstractFileByPath(
			this.getRemindersPath()
		);
		if (!(file instanceof TFile)) return [];
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		return ReminderOperations.remindersOf(fm);
	}

	private newId(): string {
		return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	}

	private today(): string {
		const d = new Date();
		const pad = (n: number) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}

	private fromFields(fields: ReminderFields): Partial<Reminder> {
		return {
			name: fields.name,
			...(fields.date && { date: fields.date }),
			...(fields.time && { time: fields.time }),
			...(fields.location && { location: fields.location }),
			...(fields.link && { link: fields.link }),
		};
	}

	async addReminder(fields: ReminderFields): Promise<void> {
		const file = await this.ensureFile();
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fm.reminders = [
					...ReminderOperations.remindersOf(fm),
					{
						id: this.newId(),
						...this.fromFields(fields),
						status: "open",
						created: this.today(),
					} as Reminder,
				];
			}
		);
	}

	/** Rebuild the entry from fields (dropping cleared optionals); keep id/status/created. */
	async updateReminder(id: string, fields: ReminderFields): Promise<void> {
		const file = await this.ensureFile();
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fm.reminders = ReminderOperations.remindersOf(fm).map((r) =>
					r.id === id
						? {
								id: r.id,
								...this.fromFields(fields),
								status: r.status ?? "open",
								...(r.created && { created: r.created }),
						  }
						: r
				);
			}
		);
	}

	async setStatus(id: string, status: "open" | "done"): Promise<void> {
		const file = await this.ensureFile();
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fm.reminders = ReminderOperations.remindersOf(fm).map((r) =>
					r.id === id ? { ...r, status } : r
				);
			}
		);
	}

	async deleteReminder(id: string): Promise<void> {
		const file = await this.ensureFile();
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fm.reminders = ReminderOperations.remindersOf(fm).filter(
					(r) => r.id !== id
				);
			}
		);
	}
}
