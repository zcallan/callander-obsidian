import { TFile, normalizePath } from "obsidian";
import { normalizeHex } from "@/utils/contrastColor";
import type { ServiceHost } from "@/services/host";
import type { EventInfo, EventStatus, EventVariant } from "@/types";
import type { EventType } from "@/constants";
import { EVENT_TYPES } from "@/constants";
import { asArray, fieldOf, fieldText, toText } from "@/utils/fm";
import { GENERATED_KEY, isGenerated } from "@/utils/generated";
import { parseFlexDate, flexSortKey, todayISO } from "@/utils/flexdate";
import { metadataSettled } from "@/utils/metadataSettled";
import {
	upsertSection,
	splitFrontmatter,
	joinFrontmatter,
} from "@/utils/markdownSection";
import { EVENTS_SECTION, ownsEventLine } from "@/utils/eventsSection";
import { displayZone, resolveToZone } from "@/utils/timezone";
import { linkpathOf } from "@/utils/linkField";
import {
	ensureFolder,
	markdownFilesIn,
	uniqueNotePath,
} from "@/services/vaultFiles";
import { eventSlug } from "@/utils/fileName";

/** The editable fields of an event — used for both create and update. */
export interface EventFields {
	name: string;
	/** FlexDate string; blank for an undated event (a task, usually). */
	date?: string;
	/** 24-hour "HH:MM". */
	time?: string;
	/** IANA zone the time belongs to, or "" / undefined for a floating
	 * time — one that means the same clock reading wherever you are. */
	timezone?: string;
	/** How long it runs, canonical "2h 30m" — read by the calendar export
	 * for an end time. Same shape a plan item stores. */
	duration?: string;
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
	/**
	 * Free-form labels — "Celtics", "Sports" — for finding a batch of
	 * events together. Left untouched when absent, so a write that doesn't
	 * know about categories can't wipe the ones already there.
	 */
	categories?: string[];
}

/** The stored variant; anything unrecognised reads as a reminder, which
 * is the safe default — it shows up rather than silently vanishing. */
export function eventVariantOf(value: unknown): EventVariant {
	return value === "timeline" ? "timeline" : "reminder";
}

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
 * Events: one markdown note per event in an Events/ folder. The single
 * calendar for everything — past hangouts on a timeline, upcoming bookings
 * on the dashboard, person-less tasks — where reminders and per-person
 * frontmatter events used to be two separate systems.
 *
 * People are wikilinks; a person's timeline (and their generated
 * "## Events" body section) derives from the events that link to them.
 */
export class EventOperations {
	constructor(private plugin: ServiceHost) {}

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

	/** `viewer` is the zone events are shown in; getEvents looks it up once
	 * for the whole list rather than once per event. */
	private toInfo(
		file: TFile,
		viewer = displayZone(this.plugin.settings.displayTimezone)
	): EventInfo {
		const fm: unknown =
			this.app.metadataCache.getFileCache(file)?.frontmatter;
		const str = (key: string) => fieldText(fm, key);
		// Events carrying a zone are converted here, once, rather than at
		// each of the twenty-odd places that read a date — a calendar cell,
		// a week heading, a sort, an upcoming filter. Converting a time can
		// move the day with it, so the two have to travel together or a
		// late-evening event lands in the wrong square. Without a zone this
		// returns its inputs untouched, which is every event predating it.
		const sourceDate = str("date");
		const sourceTime = str("time");
		const timezone = str("timezone");
		const shown = resolveToZone(
			sourceDate,
			sourceTime,
			timezone,
			viewer
		);
		return {
			file,
			name: str("name") || file.basename,
			date: shown.date,
			time: shown.time,
			timezone,
			sourceDate,
			sourceTime,
			duration: str("duration"),
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
			generated: isGenerated(fieldOf(fm, GENERATED_KEY)),
			categories: asArray(fieldOf(fm, "categories"))
				.map((c) => toText(c).trim())
				.filter(Boolean),
			// Only a real hex is taken: this goes straight into a style.
			color: normalizeHex(str("color")) ?? "",
		};
	}

	/**
	 * Every category used on any event, once each and alphabetical — what a
	 * category picker offers for reuse. Case-insensitive, first spelling
	 * wins, the way the picker matches a new name against these.
	 */
	getEventCategories(): string[] {
		const seen = new Map<string, string>();
		for (const e of this.getEvents()) {
			for (const c of e.categories) {
				const key = c.toLowerCase();
				if (!seen.has(key)) seen.set(key, c);
			}
		}
		return [...seen.values()].sort((a, b) =>
			a.localeCompare(b, undefined, { sensitivity: "base" })
		);
	}

	/** All events, straight from the metadata cache — zero file I/O. */
	getEvents(): EventInfo[] {
		const viewer = displayZone(this.plugin.settings.displayTimezone);
		return markdownFilesIn(this.app, this.getEventsFolderPath()).map(
			(file) => this.toInfo(file, viewer)
		);
	}

	/** The display name a wikilink shows: its alias if present, else the
	 * link text itself. */
	private linkName(raw: string): string {
		const inner = raw.replace(/^\[\[|\]\]$/g, "");
		const parts = inner.split("|");
		return (parts[1] ?? parts[0]).trim();
	}

	/** An event's people links resolved to vault paths (dead links drop). */
	// Structural beyond EventInfo, so a plan's members resolve the same way
	// when the Events page lists one.
	peoplePaths(event: { people: string[]; file: { path: string } }): string[] {
		return event.people
			.map((raw) => {
				const linktext = linkpathOf(raw);
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

	/** The file's name: see eventSlug. People read as their link's alias. */
	private slugFor(fields: EventFields): string {
		return eventSlug(fields, (p) => this.linkName(p));
	}

	/** A free path for this slug — dupes get "-1", "-2", … appended. */
	private freePath(slug: string, ignore?: TFile): string {
		return uniqueNotePath(this.app, this.getEventsFolderPath(), slug, {
			separator: "-",
			ignorePath: ignore?.path,
		});
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
				optional(fm, "timezone", fields.timezone) &&
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
				set("timezone", fields.timezone);
				set("duration", fields.duration);
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
				// Only when given — see EventFields.categories.
				if (fields.categories !== undefined) {
					if (fields.categories.length > 0) {
						fm.categories = fields.categories;
					} else {
						delete fm.categories;
					}
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
		await ensureFolder(this.app, this.getEventsFolderPath());
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

	/** The event's own calendar colour, "#rrggbb" — or "" to clear it and
	 * go back to its type's (or "Color by group"'s). */
	async setColor(file: TFile, color: string): Promise<void> {
		const hex = color ? normalizeHex(color) : null;
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				if (hex) fm.color = hex;
				else delete fm.color;
				fm.updated = todayISO();
			}
		);
	}

	/**
	 * Rename a category everywhere it's used — the same act as a group
	 * rename, since categories are a shared vocabulary rather than a
	 * per-event field. Matched without case; if the new name collides with
	 * one an event already carries, the two merge rather than duplicating.
	 */
	async renameCategory(oldName: string, newName: string): Promise<void> {
		const trimmed = newName.trim();
		if (!trimmed) return;
		const key = oldName.trim().toLowerCase();
		if (key === trimmed.toLowerCase()) return;
		for (const event of this.getEvents()) {
			if (!event.categories.some((c) => c.toLowerCase() === key)) continue;
			await this.app.fileManager.processFrontMatter(
				event.file,
				(fm: Record<string, unknown>) => {
					const next: string[] = [];
					for (const c of asArray(fieldOf(fm, "categories")).map(toText)) {
						const value = c.toLowerCase() === key ? trimmed : c;
						if (!next.some((n) => n.toLowerCase() === value.toLowerCase())) {
							next.push(value);
						}
					}
					if (next.length > 0) fm.categories = next;
					else delete fm.categories;
					fm.updated = todayISO();
				}
			);
		}
	}

	/**
	 * Remove a category from every event carrying it. The events
	 * themselves are untouched — only the `categories` list loses it, the
	 * same as unticking it by hand would.
	 */
	async deleteCategory(name: string): Promise<void> {
		const key = name.trim().toLowerCase();
		for (const event of this.getEvents()) {
			if (!event.categories.some((c) => c.toLowerCase() === key)) continue;
			await this.app.fileManager.processFrontMatter(
				event.file,
				(fm: Record<string, unknown>) => {
					const next = asArray(fieldOf(fm, "categories"))
						.map(toText)
						.filter((c) => c.toLowerCase() !== key);
					if (next.length > 0) fm.categories = next;
					else delete fm.categories;
					fm.updated = todayISO();
				}
			);
		}
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
				// Source, not the resolved time — this rewrites the note,
				// and the viewer's zone has no business changing what a
				// diary entry's event says.
				time: existing.sourceTime || undefined,
				timezone: existing.timezone || undefined,
				duration: existing.duration || undefined,
				type: existing.type,
				people: peopleLinks,
				location: existing.location || undefined,
				link: existing.link || undefined,
				description: existing.description || undefined,
				source,
				variant: existing.variant,
				// Every field updateEvent isn't given is cleared, and an
				// event you'd kept off people's timelines would reappear on
				// them the next time its diary entry was edited.
				showOnTimelines: existing.showOnTimelines,
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

	// ---- The generated "## Events" section on person/group pages ----

	/** Chronological wikilink list for one person's section. */
	private sectionLines(personFile: TFile): string[] {
		const events = this.eventsFor(personFile);
		const key = (e: EventInfo) => {
			// Source, not the resolved date: this list is written into
			// person pages, and ordering it by the viewer's zone would
			// rewrite those files every time you changed timezone.
			const p = parseFlexDate(e.sourceDate);
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
			const file = this.app.vault.getFileByPath(path);
			if (!file) continue;
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
