import { Notice, TFile, normalizePath } from "obsidian";
import type FriendTracker from "@/main";
import type { EventFields } from "@/services/EventOperations";
import { eventTypeOf } from "@/services/EventOperations";
import { REMINDERS_BASENAME } from "@/constants";
import {
	asArray,
	fieldOf,
	fieldText,
	isRecord,
	textIfSet,
	toText,
} from "@/utils/fm";
import { formatCount } from "@/utils/text";
import {
	ensureFolder,
	markdownFilesIn,
	uniqueNotePath,
} from "@/services/vaultFiles";
import { eventSlug } from "@/utils/fileName";

/**
 * An `events`/`interactions` value in the shape the old embedded store used:
 * a list of rows, or the empty key it could leave behind. Anything else under
 * that name — a string, a map — is the person's own field, not ours to move.
 */
function isLegacyRowList(value: unknown): boolean {
	return Array.isArray(value) || value === null;
}

/** An old embedded store with nothing left in it. */
function isEmptyLegacyRowList(value: unknown): boolean {
	return value === null || (Array.isArray(value) && value.length === 0);
}

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
					`📦 Callander moved ${formatCount(
						moved,
						"event"
					)} into ${this.ops.getEventsFolderPath()}`
				);
				this.plugin.refreshDashboards();
			}
		} finally {
			this.running = false;
		}
	}

	// ---- 1. Events embedded in person/group frontmatter ----

	private mdFilesIn(folderPath: string): TFile[] {
		return markdownFilesIn(this.app, folderPath);
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
				(isLegacyRowList(fieldOf(fm, "events")) ||
					isLegacyRowList(fieldOf(fm, "interactions")))
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
		return {
			name,
			date: textIfSet(raw.date) || undefined,
			type: eventTypeOf(textIfSet(raw.type)),
			people: [`[[${personBasename}]]`],
			location: textIfSet(raw.location) || undefined,
			link: textIfSet(raw.link) || undefined,
			description: textIfSet(raw.description) || undefined,
			source: textIfSet(raw.source) || undefined,
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

	/** Move every embedded event on one file into Events/. */
	private async migrateFileEvents(file: TFile): Promise<number> {
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
		// them so detection stops firing for this file. Only empty ones: a
		// key of the same name holding anything but a list is the person's
		// own, not an old event store.
		await this.app.fileManager.processFrontMatter(
			file,
			(fm2: Record<string, unknown>) => {
				if (isEmptyLegacyRowList(fm2.events)) delete fm2.events;
				if (isEmptyLegacyRowList(fm2.interactions)) {
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
			const str = (key: string) => fieldText(fm, key);
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
			await ensureFolder(this.app, this.ops.getEventsFolderPath());
			await this.app.fileManager.renameFile(
				file,
				this.freeEventPath(fields)
			);
			moved++;
		}
		// The folder's job is done once this run has emptied it — not merely
		// because an empty folder of that name exists, which may be yours.
		const folder = this.app.vault.getFolderByPath(folderPath);
		if (
			moved > 0 &&
			folder &&
			folder.children.length === 0
		) {
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

	/** Rewrites a reminder's frontmatter as an event's, in place, and clears
	 * the reminder-only `notes`. Written out here rather than going through
	 * EventOperations' writeEventFile. */
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

	/** freePath, reachable without exposing EventOperations internals.
	 * People read as their link's target here, not its alias. */
	private freeEventPath(fields: EventFields): string {
		const slug = eventSlug(fields, (p) =>
			p.replace(/^\[\[|\]\]$/g, "").split("|")[0]
		);
		return uniqueNotePath(this.app, this.ops.getEventsFolderPath(), slug, {
			separator: "-",
		});
	}

	// ---- 3. Rows still in the legacy Reminders.md store ----

	private async migrateLegacyStore(): Promise<number> {
		const path = normalizePath(
			`${this.plugin.settings.baseFolder}/${REMINDERS_BASENAME}.md`
		);
		const file = this.app.vault.getFileByPath(path);
		if (!file) return 0;
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		// Only the old store itself: a note of your own that happens to be
		// called Reminders has no `reminders` list, and isn't ours to trash.
		// (Nor is one that isn't indexed yet — the next cache settle retries.)
		const store = fieldOf(fm, "reminders");
		if (store === undefined) return 0;
		const rows = asArray(store).filter(isRecord);
		let moved = 0;
		for (const row of rows) {
			const name = textIfSet(row.name).trim();
			if (!name) continue;
			const created = await this.ops.createEvent(
				{
					name,
					date: textIfSet(row.date) || undefined,
					time: textIfSet(row.time) || undefined,
					type: eventTypeOf(textIfSet(row.type)),
					people: this.peopleTextToLinks(textIfSet(row.people)),
					location: textIfSet(row.location) || undefined,
					link: textIfSet(row.link) || undefined,
					description: textIfSet(row.notes) || undefined,
				},
				{ refreshSections: false }
			);
			if (textIfSet(row.status) === "done") {
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
