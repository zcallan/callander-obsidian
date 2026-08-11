import { TFile, TFolder, normalizePath } from "obsidian";
import type FriendTracker from "@/main";
import type { EventInfo } from "@/types";
import type { EventType } from "@/constants";
import { EVENT_TYPES } from "@/constants";
import { asArray, fieldOf, toText } from "@/utils/fm";
import { parseFlexDate, flexSortKey, todayISO } from "@/utils/flexdate";
import { metadataSettled } from "@/utils/metadataSettled";
import { nameWithoutLeadingEmoji } from "@/utils/emoji";
import {
	upsertSection,
	splitFrontmatter,
	joinFrontmatter,
	type SectionSpec,
} from "@/utils/markdownSection";

/** The editable fields of an event — used for both create and update. */
export interface EventFields {
	name: string;
	/** FlexDate string; blank for an undated event (a task, usually). */
	date?: string;
	/** 24-hour "HH:MM". */
	time?: string;
	type?: EventType | "";
	/** Wikilinks to people/groups, e.g. ["[[Austin Philleo]]"]. */
	people?: string[];
	location?: string;
	link?: string;
	description?: string;
	/** Diary provenance — the entry this event was logged from. */
	source?: string;
	variant?: EventVariant;
	/**
	 * Whether the people on this event see it on their own timelines.
	 *
	 * Absent means yes — which is what every event written before this
	 * existed did, so nothing already in a vault changes by adding it.
	 * Only an explicit `false` holds an event back, for a calendar entry
	 * that names people without being a record about them.
	 */
	showOnTimelines?: boolean;
}

/**
 * What an event note is FOR — the two different things that share this
 * schema.
 *
 * "reminder" is a calendar entry: something you put in the diary for
 * yourself, past or future. It shows on the dashboard and the Events
 * page.
 *
 * "timeline" is a record of something that happened with someone —
 * logged from their page or a diary entry. It belongs on their timeline
 * and nowhere else; the Events page is your calendar, not a memory book.
 *
 * Person timelines show both, so nothing is ever hidden from the person
 * it's about.
 */
export type EventVariant = "reminder" | "timeline";

/** The stored variant; anything unrecognised reads as a reminder, which
 * is the safe default — it shows up rather than silently vanishing. */
export function eventVariantOf(value: unknown): EventVariant {
	return value === "timeline" ? "timeline" : "reminder";
}

/**
 * open | done | cancelled.
 *
 * Cancelled is a soft delete: the event stays in the record — you did plan
 * it, and that's worth keeping — but drops off the dashboard, which is for
 * what's actually happening.
 */
export type EventStatus = "open" | "done" | "cancelled";

/** The stored status; anything unrecognised reads as open. */
export function eventStatusOf(value: unknown): EventStatus {
	if (value === "done") return "done";
	if (value === "cancelled") return "cancelled";
	return "open";
}

/** The id as an EventType when it's one we know, else "". */
export function eventTypeOf(value: string): EventType | "" {
	return EVENT_TYPES.some((t) => t.id === value)
		? (value as EventType)
		: "";
}

/**
 * The person page's generated Events section: a chronological list of
 * wikilinks to the event files that mention this person. Present only
 * while they have events — upsertSection removes an emptied section.
 */
const EVENTS_SECTION: SectionSpec = {
	heading: "## Events",
	matches: /^##\s+Events\s*$/i,
	// The section owns no subheadings, so any heading safely closes it.
	closes: /^#{1,6}\s/,
};
const ownsEventLine = (line: string) =>
	/^-\s+\[\[[^\]]+\]\]\s*$/.test(line.trim());

/**
 * Events: one markdown note per event in an Events/ folder. The single
 * calendar for everything — past hangouts on a timeline, upcoming bookings
 * on the dashboard, person-less tasks — where reminders and per-person
 * frontmatter events used to be two separate systems.
 *
 * People are wikilinks; a person's timeline (and their generated
 * "## Events" body section) derives from the events that link to them.
 */
export class EventOperations {
	constructor(private plugin: FriendTracker) {}

	private get app() {
		return this.plugin.app;
	}

	getEventsFolderPath(): string {
		return normalizePath(`${this.plugin.settings.baseFolder}/Events`);
	}

	isEventFile(path: string): boolean {
		return (
			path.startsWith(this.getEventsFolderPath() + "/") &&
			path.endsWith(".md")
		);
	}

	private toInfo(file: TFile): EventInfo {
		const fm: unknown =
			this.app.metadataCache.getFileCache(file)?.frontmatter;
		const str = (key: string): string => {
			const v = fieldOf(fm, key);
			return v ? toText(v) : "";
		};
		return {
			file,
			name: str("name") || file.basename,
			date: str("date"),
			time: str("time"),
			type: eventTypeOf(str("type")),
			people: asArray(fieldOf(fm, "people")).map(String),
			location: str("location"),
			link: str("link"),
			description: str("description"),
			status: eventStatusOf(str("status")),
			variant: eventVariantOf(fieldOf(fm, "variant")),
			// Only an explicit false opts out; absent means "on timelines",
			// which is how every event behaved before the flag existed.
			showOnTimelines: fieldOf(fm, "showOnTimelines") !== false,
			source: str("source"),
			created: str("created"),
			updated: str("updated"),
		};
	}

	/** All events, straight from the metadata cache — zero file I/O. */
	getEvents(): EventInfo[] {
		const folder = this.app.vault.getAbstractFileByPath(
			this.getEventsFolderPath()
		);
		if (!(folder instanceof TFolder)) return [];
		return folder.children
			.filter(
				(f): f is TFile => f instanceof TFile && f.extension === "md"
			)
			.map((file) => this.toInfo(file));
	}

	/** The display name a wikilink shows: its alias if present, else the
	 * link text itself. */
	private linkName(raw: string): string {
		const inner = raw.replace(/^\[\[|\]\]$/g, "");
		const parts = inner.split("|");
		return (parts[1] ?? parts[0]).trim();
	}

	/** An event's people links resolved to vault paths (dead links drop). */
	peoplePaths(event: EventInfo): string[] {
		return event.people
			.map((raw) => {
				const linktext = raw
					.replace(/^\[\[|\]\]$/g, "")
					.split("|")[0]
					.trim();
				const dest = this.app.metadataCache.getFirstLinkpathDest(
					linktext,
					event.file.path
				);
				return dest?.path ?? "";
			})
			.filter(Boolean);
	}

	/** Every event linking to this person/group file. Unsorted — the
	 * timeline does its own ordering. */
	eventsFor(file: TFile): EventInfo[] {
		return this.getEvents().filter((e) =>
			this.peoplePaths(e).includes(file.path)
		);
	}

	/** person/group path → their events, built in one pass over the folder
	 * — for getContacts, which would otherwise resolve N×M links. */
	eventsByPersonPath(): Map<string, EventInfo[]> {
		const map = new Map<string, EventInfo[]>();
		for (const event of this.getEvents()) {
			// Named on it, but deliberately kept off their page — a calendar
			// entry that mentions someone isn't automatically about them.
			if (event.showOnTimelines === false) continue;
			for (const path of this.peoplePaths(event)) {
				const list = map.get(path);
				if (list) list.push(event);
				else map.set(path, [event]);
			}
		}
		return map;
	}

	/** The event logged from a given diary entry, if any. */
	findBySource(source: string): EventInfo | undefined {
		return this.getEvents().find((e) => e.source === source);
	}

	// ---- File naming ----

	/**
	 * The file's name is a generated slug — "2026-08-06 Austin • Concert"
	 * — from the date, up to two people, and the event name. Frontmatter
	 * `name` stays the event's only real name (emoji and all); the slug
	 * just makes the quick switcher and file explorer readable, so a
	 * leading emoji is dropped there rather than repeated in the filename.
	 * Three or more people would sprawl, so they stay out of the slug
	 * entirely.
	 */
	private slugFor(fields: EventFields): string {
		const sanitize = (s: string) =>
			s.replace(/[\\/:*?"<>|#^[\]]/g, "-").trim();
		const name =
			sanitize(nameWithoutLeadingEmoji(fields.name)).slice(0, 60).trim() ||
			"Event";
		const people = (fields.people ?? []).map((p) =>
			sanitize(this.linkName(p))
		);
		const who =
			people.length >= 1 && people.length <= 2
				? people.join(" & ")
				: "";
		const date = (fields.date ?? "").trim();
		const prefix = [date, who].filter(Boolean).join(" ");
		if (!prefix) return name;
		// People get a "•" so the slug reads "who • what"; a bare date
		// runs straight into the name.
		return who ? `${prefix} • ${name}` : `${prefix} ${name}`;
	}

	/** A free path for this slug — dupes get "-1", "-2", … appended. */
	private freePath(slug: string, ignore?: TFile): string {
		const folder = this.getEventsFolderPath();
		let path = normalizePath(`${folder}/${slug}.md`);
		let counter = 1;
		while (true) {
			const existing = this.app.vault.getAbstractFileByPath(path);
			if (!existing || existing === ignore) return path;
			path = normalizePath(`${folder}/${slug}-${counter++}.md`);
		}
	}

	// ---- Writes ----

	/** Rebuild the fields (dropping cleared optionals); keeps status and
	 * created, stamps updated, and waits for the cache to catch up. */
	private async writeEventFile(
		file: TFile,
		fields: EventFields
	): Promise<void> {
		const optional = (
			fm: Record<string, unknown> | undefined,
			key: string,
			value: string | undefined
		) => (value ? fm?.[key] === value : fm?.[key] === undefined);
		const people = fields.people ?? [];
		const settled = metadataSettled(this.app, file.path, {
			until: (fm) =>
				fm?.name === fields.name &&
				optional(fm, "date", fields.date) &&
				optional(fm, "time", fields.time) &&
				optional(fm, "type", fields.type || undefined) &&
				(people.length === 0
					? fm?.people === undefined
					: Array.isArray(fm?.people) &&
					  fm.people.length === people.length &&
					  fm.people.every((v, i) => v === people[i])),
		});
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
				if (people.length > 0) fm.people = people;
				else delete fm.people;
				set("location", fields.location);
				set("link", fields.link);
				set("description", fields.description);
				set("source", fields.source);
				// Written out even for the default, so an unclassified note
				// (one the variant migration hasn't reached) stays tellable
				// from one deliberately left as a reminder.
				fm.variant = eventVariantOf(fields.variant);
				// Only the opt-out is worth storing — leaving the key off
				// for the default keeps it out of notes you'll actually open.
				if (fields.showOnTimelines === false) {
					fm.showOnTimelines = false;
				} else {
					delete fm.showOnTimelines;
				}
				delete fm.hideFromDashboard;
				fm.updated = todayISO();
			}
		);
		await settled;
	}

	async createEvent(
		fields: EventFields,
		opts: { refreshSections?: boolean } = {}
	): Promise<TFile> {
		const folderPath = this.getEventsFolderPath();
		if (!this.app.vault.getAbstractFileByPath(folderPath)) {
			await this.app.vault.createFolder(folderPath);
		}
		const path = this.freePath(this.slugFor(fields));
		const file = await this.app.vault.create(
			path,
			`---\nkind: event\nname: ${JSON.stringify(
				fields.name
			)}\nstatus: open\ncreated: ${todayISO()}\n---\n`
		);
		// Set the optional fields through the same path as an edit, so
		// values are serialized consistently (this also stamps `updated`).
		await this.writeEventFile(file, fields);
		if (opts.refreshSections !== false) {
			await this.refreshPersonSections(
				this.peoplePaths(this.toInfo(file))
			);
		}
		return file;
	}

	async updateEvent(file: TFile, fields: EventFields): Promise<void> {
		// People removed by the edit still need their section rewritten —
		// collect the affected set from both sides of the write.
		const before = this.peoplePaths(this.toInfo(file));
		await this.writeEventFile(file, fields);
		// The slug tracks the content it's built from; a rename keeps the
		// person pages' wikilinks pointing here via Obsidian's own link
		// maintenance.
		const slug = this.slugFor(fields);
		if (file.basename !== slug) {
			const target = this.freePath(slug, file);
			if (target !== file.path) {
				await this.app.fileManager.renameFile(file, target);
			}
		}
		const after = this.peoplePaths(this.toInfo(file));
		await this.refreshPersonSections([...new Set([...before, ...after])]);
	}

	async setStatus(file: TFile, status: EventStatus): Promise<void> {
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fm.status = status;
				fm.updated = todayISO();
			}
		);
	}

	async setVariant(file: TFile, variant: EventVariant): Promise<void> {
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fm.variant = variant;
				delete fm.hideFromDashboard;
				fm.updated = todayISO();
			}
		);
	}

	/** Lighter than a full update — the view modal's debounced notes box. */
	async setDescription(file: TFile, value: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				if (value) fm.description = value;
				else delete fm.description;
				fm.updated = todayISO();
			}
		);
	}

	async deleteEvent(file: TFile): Promise<void> {
		const people = this.peoplePaths(this.toInfo(file));
		await this.app.fileManager.trashFile(file);
		await this.refreshPersonSections(people);
	}

	// ---- Diary provenance ----

	/**
	 * Keep the event derived from a diary entry in line with the entry:
	 * one event per entry, whoever it [[mentions]] attached. No mentions
	 * removes it. A manually adjusted type or description is preserved.
	 */
	async syncDiaryEvent(
		source: string,
		date: string,
		name: string,
		peopleLinks: string[]
	): Promise<void> {
		const existing = this.findBySource(source);
		if (peopleLinks.length === 0) {
			if (existing) await this.deleteEvent(existing.file);
			return;
		}
		if (existing) {
			await this.updateEvent(existing.file, {
				name,
				date,
				time: existing.time || undefined,
				type: existing.type,
				people: peopleLinks,
				location: existing.location || undefined,
				link: existing.link || undefined,
				description: existing.description || undefined,
				source,
				variant: existing.variant,
			});
			return;
		}
		// A diary entry records what happened, so it belongs on the people's
		// timelines rather than on your calendar.
		await this.createEvent({
			name,
			date,
			type: "hangout",
			people: peopleLinks,
			source,
			variant: "timeline",
		});
	}

	async removeDiaryEvent(source: string): Promise<void> {
		const existing = this.findBySource(source);
		if (existing) await this.deleteEvent(existing.file);
	}

	/** A diary entry was renamed — keep event source links pointing at it. */
	async retargetDiarySource(
		oldPath: string,
		newPath: string
	): Promise<void> {
		for (const e of this.getEvents()) {
			if (e.source !== oldPath) continue;
			await this.app.fileManager.processFrontMatter(
				e.file,
				(fm: Record<string, unknown>) => {
					fm.source = newPath;
				}
			);
		}
	}

	/**
	 * Point every event linking to `from` at `to` instead — merging two
	 * duplicate friends into one. Links already carrying `to` dedupe.
	 */
	async retargetPerson(from: TFile, to: TFile): Promise<void> {
		const touched: string[] = [];
		for (const e of this.getEvents()) {
			if (!this.peoplePaths(e).includes(from.path)) continue;
			await this.app.fileManager.processFrontMatter(
				e.file,
				(fm: Record<string, unknown>) => {
					const links = asArray(fm.people).map(String);
					const next = links.map((raw) => {
						const linktext = raw
							.replace(/^\[\[|\]\]$/g, "")
							.split("|")[0]
							.trim();
						const dest =
							this.app.metadataCache.getFirstLinkpathDest(
								linktext,
								e.file.path
							);
						return dest?.path === from.path
							? `[[${to.basename}]]`
							: raw;
					});
					fm.people = [...new Set(next)];
				}
			);
			touched.push(e.file.path);
		}
		if (touched.length > 0) {
			await this.refreshPersonSections([from.path, to.path]);
		}
	}

	// ---- The generated "## Events" section on person/group pages ----

	/** Chronological wikilink list for one person's section. */
	private sectionLines(personFile: TFile): string[] {
		const events = this.eventsFor(personFile);
		const key = (e: EventInfo) => {
			const p = parseFlexDate(e.date);
			// Undated events sink to the bottom rather than leading the list.
			return p && p.year !== null
				? flexSortKey(p)
				: Number.MAX_SAFE_INTEGER;
		};
		return events
			.sort((a, b) => key(a) - key(b))
			.map((e) => `- [[${e.file.basename}]]`);
	}

	/**
	 * Rewrite the generated Events section of each affected person/group
	 * page. The section only exists while they have events — an emptied
	 * list removes the heading too.
	 */
	async refreshPersonSections(paths: string[]): Promise<void> {
		for (const path of paths) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) continue;
			const lines = this.sectionLines(file);
			await this.app.vault.process(file, (content) => {
				const { frontmatter, body } = splitFrontmatter(content);
				return joinFrontmatter(
					frontmatter,
					upsertSection(body, EVENTS_SECTION, lines, ownsEventLine)
				);
			});
		}
	}
}
