import { Notice, TFile, TFolder, normalizePath } from "obsidian";
import type FriendTracker from "@/main";
import type { EventFields } from "@/services/EventOperations";
import { eventTypeOf } from "@/services/EventOperations";
import { REMINDERS_BASENAME } from "@/constants";
import { asArray, fieldOf, isRecord, toText } from "@/utils/fm";
import { nameWithoutLeadingEmoji } from "@/utils/emoji";

/**
 * The one-time (per datum) reshuffle behind the reminders→events merge:
 *
 *   1. events embedded in person/group frontmatter → one file each under
 *      Events/, linked back via `people`
 *   2. kind:reminder files → kind:event, moved into Events/
 *   3. rows still in the legacy Reminders.md store → files
 *
 * Detection-based rather than versioned: it runs on every load (and every
 * metadata re-resolve) and migrates whatever old-shape data it finds, so a
 * stale file syncing in from a device that missed the update is caught the
 * next time the cache settles. Per-item ordering is loss-proof — the event
 * file is written and indexed before its source row is removed, so a crash
 * mid-way leaves a visible duplicate, never a hole.
 */
export class EventMigration {
	private running = false;

	constructor(private plugin: FriendTracker) {}

	private get app() {
		return this.plugin.app;
	}

	private get ops() {
		return this.plugin.eventOperations;
	}

	async run(): Promise<void> {
		if (this.running) return;
		this.running = true;
		try {
			let moved = 0;
			for (const file of this.filesWithEmbeddedEvents()) {
				moved += await this.migrateFileEvents(file);
			}
			moved += await this.migrateReminderFiles();
			moved += await this.migrateLegacyStore();
			if (moved > 0) {
				new Notice(
					`📦 Callander moved ${moved} event${
						moved === 1 ? "" : "s"
					} into ${this.ops.getEventsFolderPath()}`
				);
				this.plugin.refreshDashboards();
			}
		} finally {
			this.running = false;
		}
	}

	// ---- 1. Events embedded in person/group frontmatter ----

	private mdFilesIn(folderPath: string): TFile[] {
		const folder = this.app.vault.getAbstractFileByPath(
			normalizePath(folderPath)
		);
		if (!(folder instanceof TFolder)) return [];
		return folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === "md"
		);
	}

	private filesWithEmbeddedEvents(): TFile[] {
		const candidates = [
			...this.mdFilesIn(
				this.plugin.contactOperations.getPeopleFolderPath()
			),
			...this.mdFilesIn(
				this.plugin.contactOperations.getGroupsFolderPath()
			),
		];
		return candidates.filter((file) => {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			return (
				!!fm &&
				(fieldOf(fm, "events") !== undefined ||
					fieldOf(fm, "interactions") !== undefined)
			);
		});
	}

	/** One embedded row → EventFields, linked back to its person. */
	private embeddedToFields(
		raw: unknown,
		personBasename: string
	): EventFields | null {
		if (!isRecord(raw)) return null;
		const name = toText(raw.text ?? "").trim();
		if (!name) return null;
		const str = (v: unknown) => (v ? toText(v) : "");
		return {
			name,
			date: str(raw.date) || undefined,
			type: eventTypeOf(str(raw.type)),
			people: [`[[${personBasename}]]`],
			location: str(raw.location) || undefined,
			link: str(raw.link) || undefined,
			description: str(raw.description) || undefined,
			source: str(raw.source) || undefined,
			// These lived inside a person's frontmatter, so every one of
			// them is a record of that person by definition — never a
			// calendar entry of your own.
			variant: "timeline",
		};
	}

	/** Splice ONE embedded row (matched by content) out of the file. Only
	 * the first match goes — two identical rows migrate as two files. */
	private async removeEmbedded(file: TFile, target: unknown): Promise<void> {
		const json = JSON.stringify(target);
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				for (const key of ["events", "interactions"]) {
					const list = asArray(fm[key]);
					const index = list.findIndex(
						(e) => JSON.stringify(e) === json
					);
					if (index === -1) continue;
					list.splice(index, 1);
					if (list.length > 0) fm[key] = list;
					else delete fm[key];
					return;
				}
			}
		);
	}

	/** Move every embedded event on one file into Events/. Public so the
	 * straggler watcher can target a single just-synced file. */
	async migrateFileEvents(file: TFile): Promise<number> {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const rows = [
			...asArray(fieldOf(fm, "events")),
			...asArray(fieldOf(fm, "interactions")),
		];
		let moved = 0;
		for (const raw of rows) {
			const fields = this.embeddedToFields(raw, file.basename);
			if (fields) {
				await this.ops.createEvent(fields, {
					refreshSections: false,
				});
				moved++;
			}
			// Row removed (or dropped, when unreadable) only after the
			// event file exists — a crash between the two leaves a
			// duplicate, never a hole.
			await this.removeEmbedded(file, raw);
		}
		// Keys that are present but empty still count as old-shape — clear
		// them so detection stops firing for this file.
		await this.app.fileManager.processFrontMatter(
			file,
			(fm2: Record<string, unknown>) => {
				if (asArray(fm2.events).length === 0) delete fm2.events;
				if (asArray(fm2.interactions).length === 0) {
					delete fm2.interactions;
				}
			}
		);
		if (moved > 0) await this.ops.refreshPersonSections([file.path]);
		return moved;
	}

	// ---- 2. kind:reminder files → kind:event, moved into Events/ ----

	private async migrateReminderFiles(): Promise<number> {
		const folderPath = normalizePath(
			`${this.plugin.settings.baseFolder}/${REMINDERS_BASENAME}`
		);
		const files = this.mdFilesIn(folderPath).filter((file) => {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			return toText(fieldOf(fm, "kind") ?? "") === "reminder";
		});
		let moved = 0;
		for (const file of files) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			const str = (key: string) => {
				const v = fieldOf(fm, key);
				return v ? toText(v) : "";
			};
			const fields: EventFields = {
				name: str("name") || file.basename,
				date: str("date") || undefined,
				time: str("time") || undefined,
				type: eventTypeOf(str("type")),
				people: this.peopleTextToLinks(str("people")),
				location: str("location") || undefined,
				link: str("link") || undefined,
				description: str("notes") || undefined,
				source: str("source") || undefined,
			};
			// Transform in place (kind, fields, people as links), sweep the
			// retired keys, then move the file into Events/ under its slug.
			await this.writeAsEvent(file, fields);
			const eventsFolder = this.ops.getEventsFolderPath();
			if (!this.app.vault.getAbstractFileByPath(eventsFolder)) {
				await this.app.vault.createFolder(eventsFolder);
			}
			await this.app.fileManager.renameFile(
				file,
				this.freeEventPath(fields)
			);
			moved++;
		}
		// The folder's job is done once it's empty.
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (folder instanceof TFolder && folder.children.length === 0) {
			try {
				await this.app.fileManager.trashFile(folder);
			} catch {
				// A leftover empty folder is harmless.
			}
		}
		return moved;
	}

	/** Reminders kept people as free text; events keep wikilinks. Names
	 * become links whether or not they resolve — an unresolved link keeps
	 * the name visible in the file rather than silently dropping it. */
	private peopleTextToLinks(text: string): string[] | undefined {
		const links = text
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean)
			.map((n) => `[[${n}]]`);
		return links.length > 0 ? links : undefined;
	}

	/** writeEventFile equivalent for the in-place reminder transform —
	 * uses the same code path, then clears the reminder-only keys. */
	private async writeAsEvent(
		file: TFile,
		fields: EventFields
	): Promise<void> {
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				const set = (key: string, value: string | undefined) => {
					if (value) fm[key] = value;
					else delete fm[key];
				};
				fm.kind = "event";
				fm.name = fields.name;
				set("date", fields.date);
				set("time", fields.time);
				set("type", fields.type || undefined);
				if (fields.people && fields.people.length > 0) {
					fm.people = fields.people;
				} else {
					delete fm.people;
				}
				set("location", fields.location);
				set("link", fields.link);
				set("description", fields.description);
				delete fm.notes;
			}
		);
	}

	/** freePath, reachable without exposing EventOperations internals. */
	private freeEventPath(fields: EventFields): string {
		const folder = this.ops.getEventsFolderPath();
		const sanitize = (s: string) =>
			s.replace(/[\\/:*?"<>|#^[\]]/g, "-").trim();
		const name =
			sanitize(nameWithoutLeadingEmoji(fields.name)).slice(0, 60).trim() ||
			"Event";
		const people = (fields.people ?? []).map((p) =>
			sanitize(p.replace(/^\[\[|\]\]$/g, "").split("|")[0])
		);
		const who =
			people.length >= 1 && people.length <= 2
				? people.join(" & ")
				: "";
		const date = (fields.date ?? "").trim();
		const prefix = [date, who].filter(Boolean).join(" ");
		const slug = !prefix
			? name
			: who
			? `${prefix} • ${name}`
			: `${prefix} ${name}`;
		let path = normalizePath(`${folder}/${slug}.md`);
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(path)) {
			path = normalizePath(`${folder}/${slug}-${counter++}.md`);
		}
		return path;
	}

	// ---- 3. Rows still in the legacy Reminders.md store ----

	private async migrateLegacyStore(): Promise<number> {
		const path = normalizePath(
			`${this.plugin.settings.baseFolder}/${REMINDERS_BASENAME}.md`
		);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return 0;
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const rows = asArray(fieldOf(fm, "reminders")).filter(isRecord);
		let moved = 0;
		for (const row of rows) {
			const str = (v: unknown) => (v ? toText(v) : "");
			const name = str(row.name).trim();
			if (!name) continue;
			const created = await this.ops.createEvent(
				{
					name,
					date: str(row.date) || undefined,
					time: str(row.time) || undefined,
					type: eventTypeOf(str(row.type)),
					people: this.peopleTextToLinks(str(row.people)),
					location: str(row.location) || undefined,
					link: str(row.link) || undefined,
					description: str(row.notes) || undefined,
				},
				{ refreshSections: false }
			);
			if (str(row.status) === "done") {
				await this.ops.setStatus(created, "done");
			}
			moved++;
		}
		// Every row extracted — the store itself goes to the trash, where
		// it stays recoverable.
		await this.app.fileManager.trashFile(file);
		return moved;
	}
}
