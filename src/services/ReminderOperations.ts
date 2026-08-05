import { TFile, TFolder, normalizePath } from "obsidian";
import type FriendTracker from "@/main";
import type { Reminder } from "@/types";
import { REMINDERS_BASENAME, REMINDER_TYPES } from "@/constants";
import type { ReminderType } from "@/constants";
import { asArray, fieldOf, isRecord, toText } from "@/utils/fm";
import { todayISO } from "@/utils/flexdate";
import { metadataSettled } from "@/utils/metadataSettled";

/** The editable fields of a reminder — used for both create and update. */
export interface ReminderFields {
	name: string;
	date?: string;
	time?: string;
	type?: ReminderType;
	location?: string;
	link?: string;
	people?: string;
	notes?: string;
}

/** The id as a ReminderType when it's one we know, else undefined. */
function reminderTypeOf(value: string): ReminderType | undefined {
	const match = REMINDER_TYPES.find((t) => t.id === value);
	return match?.id;
}

/**
 * Standalone scheduled reminders. One markdown note per reminder in a
 * Reminders/ folder (mirroring Somedays), surfaced on the dashboard's
 * Upcoming section.
 *
 * Reminders used to live as rows inside a single Reminders.md store; that
 * file is still read (and its rows can still be completed/edited/deleted)
 * so nobody loses reminders on update, but everything new is a file.
 * TODO(~2026-09): drop the legacy read path + the dashboard migration
 * notice once users have had a month or so to move across.
 */
export class ReminderOperations {
	constructor(private plugin: FriendTracker) {}

	private get app() {
		return this.plugin.app;
	}

	getRemindersFolderPath(): string {
		return normalizePath(`${this.plugin.settings.baseFolder}/Reminders`);
	}

	/** All reminders: per-file ones plus any legacy Reminders.md rows. */
	getReminders(): Reminder[] {
		return [...this.getFolderReminders(), ...this.getLegacyReminders()];
	}

	// ---- Per-file reminders (the current storage) ----

	private getFolderReminders(): Reminder[] {
		const folder = this.app.vault.getAbstractFileByPath(
			this.getRemindersFolderPath()
		);
		if (!(folder instanceof TFolder)) return [];
		return folder.children
			.filter(
				(f): f is TFile => f instanceof TFile && f.extension === "md"
			)
			.map((file) => this.toReminder(file));
	}

	private toReminder(file: TFile): Reminder {
		const fm: unknown =
			this.app.metadataCache.getFileCache(file)?.frontmatter;
		const str = (key: string): string => {
			const v = fieldOf(fm, key);
			return v ? toText(v) : "";
		};
		const date = str("date");
		const time = str("time");
		const type = reminderTypeOf(str("type"));
		const location = str("location");
		const link = str("link");
		const people = str("people");
		const notes = str("notes");
		const created = str("created");
		const updated = str("updated");
		return {
			id: file.path,
			file,
			name: str("name") || file.basename,
			...(date && { date }),
			...(time && { time }),
			...(type && { type }),
			...(location && { location }),
			...(link && { link }),
			...(people && { people }),
			...(notes && { notes }),
			status: str("status") === "done" ? "done" : "open",
			...(created && { created }),
			...(updated && { updated }),
		};
	}

	async addReminder(fields: ReminderFields): Promise<TFile> {
		const folderPath = this.getRemindersFolderPath();
		if (!this.app.vault.getAbstractFileByPath(folderPath)) {
			await this.app.vault.createFolder(folderPath);
		}
		const safeName =
			fields.name.replace(/[\\/:*?"<>|#^[\]]/g, "-").trim() ||
			"Reminder";
		let path = normalizePath(`${folderPath}/${safeName}.md`);
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(path)) {
			path = normalizePath(`${folderPath}/${safeName} ${counter++}.md`);
		}
		const file = await this.app.vault.create(
			path,
			`---\nkind: reminder\nname: ${JSON.stringify(
				fields.name
			)}\nstatus: open\ncreated: ${todayISO()}\n---\n`
		);
		// Set the optional fields through the same path as an edit, so
		// values are serialized consistently (this also stamps `updated`).
		await this.writeReminderFile(file, fields);
		return file;
	}

	/** Rebuild the fields (dropping cleared optionals); keep status/created. */
	private async writeReminderFile(
		file: TFile,
		fields: ReminderFields
	): Promise<void> {
		// Reminders are read back through the metadata cache, so this can't
		// return until that cache reflects the write — the dashboard
		// refreshes the moment the modal closes, and would otherwise render
		// the reminder with no type and no date until it was reopened.
		//
		// Matched against the values themselves rather than just "an index
		// happened": creating a reminder writes the file twice, and the
		// first write's index event would otherwise satisfy the wait while
		// the fields below are still missing.
		const optional = (
			fm: Record<string, unknown> | undefined,
			key: string,
			value: string | undefined
		) => (value ? fm?.[key] === value : fm?.[key] === undefined);
		const settled = metadataSettled(this.app, file.path, {
			until: (fm) =>
				fm?.name === fields.name &&
				optional(fm, "date", fields.date) &&
				optional(fm, "time", fields.time) &&
				optional(fm, "type", fields.type) &&
				optional(fm, "location", fields.location) &&
				optional(fm, "link", fields.link) &&
				optional(fm, "people", fields.people),
		});
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				const set = (key: string, value: string | undefined) => {
					if (value) fm[key] = value;
					else delete fm[key];
				};
				fm.name = fields.name;
				set("date", fields.date);
				set("time", fields.time);
				set("type", fields.type);
				set("location", fields.location);
				set("link", fields.link);
				set("people", fields.people);
				set("notes", fields.notes);
				fm.updated = todayISO();
			}
		);
		await settled;
	}

	// ---- Routing: a Reminder knows which store it lives in ----

	async updateReminder(
		reminder: Reminder,
		fields: ReminderFields
	): Promise<void> {
		if (reminder.file) {
			await this.writeReminderFile(reminder.file, fields);
		} else {
			await this.updateLegacyReminder(reminder.id, fields);
		}
	}

	async setStatus(
		reminder: Reminder,
		status: "open" | "done"
	): Promise<void> {
		if (reminder.file) {
			await this.app.fileManager.processFrontMatter(
				reminder.file,
				(fm: Record<string, unknown>) => {
					fm.status = status;
					fm.updated = todayISO();
				}
			);
		} else {
			await this.setLegacyStatus(reminder.id, status);
		}
	}

	async deleteReminder(reminder: Reminder): Promise<void> {
		if (reminder.file) {
			await this.app.fileManager.trashFile(reminder.file);
		} else {
			await this.deleteLegacyReminder(reminder.id);
		}
	}

	// ---- Legacy single-file store (read + edit only; nothing new lands here) ----

	getLegacyStorePath(): string {
		return normalizePath(
			`${this.plugin.settings.baseFolder}/${REMINDERS_BASENAME}.md`
		);
	}

	private getLegacyStoreFile(): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(
			this.getLegacyStorePath()
		);
		return file instanceof TFile ? file : null;
	}

	static remindersOf(metadata: unknown): Reminder[] {
		return asArray(fieldOf(metadata, "reminders"))
			.map((raw): Reminder => {
				const r = isRecord(raw) ? raw : {};
				const type = reminderTypeOf(toText(r.type));
				return {
					id: toText(r.id),
					name: toText(r.name),
					...(r.date ? { date: toText(r.date) } : {}),
					...(r.time ? { time: toText(r.time) } : {}),
					...(type && { type }),
					...(r.location ? { location: toText(r.location) } : {}),
					...(r.link ? { link: toText(r.link) } : {}),
					...(r.people ? { people: toText(r.people) } : {}),
					...(r.notes ? { notes: toText(r.notes) } : {}),
					status: r.status === "done" ? "done" : "open",
					...(r.created ? { created: toText(r.created) } : {}),
				};
			})
			.filter((r) => r.name.length > 0);
	}

	private getLegacyReminders(): Reminder[] {
		const file = this.getLegacyStoreFile();
		if (!file) return [];
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		return ReminderOperations.remindersOf(fm);
	}

	/** How many rows still sit in Reminders.md — drives the migration notice. */
	legacyReminderCount(): number {
		return this.getLegacyReminders().length;
	}

	private fromFields(fields: ReminderFields): Partial<Reminder> {
		return {
			name: fields.name,
			...(fields.date && { date: fields.date }),
			...(fields.time && { time: fields.time }),
			...(fields.type && { type: fields.type }),
			...(fields.location && { location: fields.location }),
			...(fields.link && { link: fields.link }),
			...(fields.people && { people: fields.people }),
			...(fields.notes && { notes: fields.notes }),
		};
	}

	private async updateLegacyReminder(
		id: string,
		fields: ReminderFields
	): Promise<void> {
		const file = this.getLegacyStoreFile();
		if (!file) return;
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

	private async setLegacyStatus(
		id: string,
		status: "open" | "done"
	): Promise<void> {
		const file = this.getLegacyStoreFile();
		if (!file) return;
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fm.reminders = ReminderOperations.remindersOf(fm).map((r) =>
					r.id === id ? { ...r, status } : r
				);
			}
		);
	}

	private async deleteLegacyReminder(id: string): Promise<void> {
		const file = this.getLegacyStoreFile();
		if (!file) return;
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
