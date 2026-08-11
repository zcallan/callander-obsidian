import { EVENT_TYPES } from "@/constants";
import { parseFlexDate, flexSortKey, isFlexUpcoming } from "@/utils/flexdate";
import { splitLeadingEmoji } from "@/utils/emoji";
import {
	daysUntilFlex,
	immediacyRelative,
	upcomingWhen,
	type RowTone,
} from "@/utils/upcomingWhen";
import type { EventVariant } from "@/services/EventOperations";

/**
 * The parts an event row is built from, and the order the Events page
 * lists them in.
 *
 * Structural rather than typed against EventInfo — it needs no TFile, so
 * the unit suite can exercise it against plain objects. People arrive
 * already resolved to display names, which keeps this free of the
 * metadata cache.
 */
export interface RowableEvent {
	name: string;
	date: string;
	time: string;
	type: string;
	location: string;
	status: string;
}

/** The row fields buildUpcomingRow wants, minus its click handler. */
export interface EventRowFields {
	icon: string;
	date: string;
	time: string;
	name: string;
	suffix: string;
	relative: string;
	tone?: RowTone;
	/** Called off — the row strikes its name and says so. */
	cancelled?: boolean;
}

/** 24h "19:00" → "7:00 PM"; anything unparseable passes through. */
export function formatEventTime(t: string): string {
	const [h, m] = t.split(":").map(Number);
	if (Number.isNaN(h)) return t;
	const period = h < 12 ? "AM" : "PM";
	const hr = h % 12 === 0 ? 12 : h % 12;
	return `${hr}:${String(m || 0).padStart(2, "0")} ${period}`;
}

/**
 * How an event reads as a row — shared by the dashboard's Upcoming
 * section and the Events page, so the same event looks the same in both.
 *
 * People arrive already resolved to display names, which keeps this free
 * of the metadata cache and testable against plain objects.
 */
export function eventRowFields(
	e: RowableEvent,
	now: Date,
	peopleNames = "",
	/** Say near dates by weekday — see conversationalLabel. */
	options: { conversational?: boolean } = {}
): EventRowFields {
	// The event's own name may lead with an emoji; otherwise its type
	// supplies one, and a bare calendar is the last resort.
	const lead = splitLeadingEmoji(e.name);
	const type = EVENT_TYPES.find((t) => t.id === e.type);
	const cancelled = e.status === "cancelled";
	const { date, relative, tone } = upcomingWhen(e.date, now, options);

	// Where the date label already names the day, the right-hand column
	// counts down rather than echoing it — and says whether something
	// happening today has started yet.
	const days = options.conversational ? daysUntilFlex(e.date, now) : null;
	const immediacy =
		days === null ? null : immediacyRelative(days, e.time, now);

	// A same-day event starting at or after 6pm reads better as "tonight"
	// — "today" undersells something you're about to walk out the door for.
	const isTonight =
		relative === "today" && !!e.time && Number(e.time.split(":")[0]) >= 18;

	return {
		icon: lead ? lead.emoji : type?.emoji ?? "📅",
		// An undated event is a standing task, not something with a slot —
		// "Anytime" says so, where a blank would just look broken.
		date: date || "Anytime",
		time: e.time ? formatEventTime(e.time) : "",
		name: lead ? lead.rest : e.name,
		// Whoever's involved rides beside the name; a person-less event
		// shows where it is instead. A cancelled one says so here instead
		// of either — who was coming and where stopped mattering.
		suffix: cancelled ? "Cancelled" : peopleNames || e.location,
		...(cancelled && { cancelled: true }),
		relative: immediacy ?? (isTonight ? "tonight" : relative),
		tone,
	};
}

export const EVENT_SORTS = [
	{ id: "natural", label: "Natural" },
	{ id: "newest", label: "Newest" },
	{ id: "oldest", label: "Oldest" },
	{ id: "type", label: "Type" },
	{ id: "updated", label: "Last updated" },
	{ id: "nameAsc", label: "Name (A-Z)" },
	{ id: "nameDesc", label: "Name (Z-A)" },
] as const;

export type EventSort = (typeof EVENT_SORTS)[number]["id"];

/** A stored sort, or the default when it's one we no longer offer —
 * "Upcoming" and "Past" used to live here before becoming filters, and
 * "Soonest" and "Nearest" were this sort's own earlier names. */
export function eventSortOf(value: unknown): EventSort {
	return EVENT_SORTS.some((s) => s.id === value)
		? (value as EventSort)
		: "natural";
}

/**
 * Which half of the timeline to show. Separate from the sort, which only
 * decides the order: the two used to be one control, so picking "Past"
 * also fixed you to most-recent-first whether you wanted that or not.
 */
export const EVENT_WHEN_FILTERS = [
	{ id: "upcoming", label: "Upcoming" },
	{ id: "past", label: "Past" },
	{ id: "all", label: "All" },
] as const;

/**
 * Always exactly one of the three. "all" is a named option rather than an
 * absence of one, so the page can't end up in a state nothing is asserting
 * — and the pills always have something lit.
 */
export type EventWhen = (typeof EVENT_WHEN_FILTERS)[number]["id"];

/**
 * Still ahead of today. An undated event counts as ahead: it hasn't
 * happened, so it belongs with what's still to come rather than history.
 */
export function isEventAhead(date: string, now: Date): boolean {
	const f = parseFlexDate(date);
	return !f || isFlexUpcoming(f, now);
}

export function matchesEventWhen(
	date: string,
	when: EventWhen,
	now = new Date()
): boolean {
	if (when === "all") return true;
	const ahead = isEventAhead(date, now);
	return when === "upcoming" ? ahead : !ahead;
}

export interface SortableEvent {
	file: { path: string };
	name: string;
	date: string;
	type: string;
	status: string;
	/** YYYY-MM-DD stamps written when the note was made and last edited. */
	created: string;
	updated: string;
}

/**
 * Alphabetise on the words, not on a leading emoji — an event may carry
 * its own ("🎂 Birthday dinner"), and comparing it would sort every such
 * event above the letters for no visible reason.
 */
function byName(a: SortableEvent, b: SortableEvent): number {
	const strip = (s: string) => splitLeadingEmoji(s)?.rest || s.trim();
	return strip(a.name).localeCompare(strip(b.name));
}

/**
 * Where each type sits in the "Type" sort, with "Other" pinned last and
 * untyped below even that.
 *
 * Ranked on the label because that's the word on screen. Every event
 * label is currently just its id capitalised, so this happens to match
 * id order exactly — it's the labels that are authoritative if the two
 * ever part company.
 */
const TYPE_RANK = new Map<string, number>(
	EVENT_TYPES.filter((t) => t.id !== "other")
		.slice()
		.sort((a, b) => a.label.localeCompare(b.label))
		.map((t, i) => [t.id, i])
);
const OTHER_RANK = TYPE_RANK.size;
const UNTYPED_RANK = OTHER_RANK + 1;

function typeRank(type: string): number {
	if (type === "other") return OTHER_RANK;
	return TYPE_RANK.get(type) ?? UNTYPED_RANK;
}

/**
 * An undated event has no place on a timeline, so it sits at whichever
 * end is "furthest away" — last under every date sort rather than
 * pretending to be ancient or imminent.
 */
const UNDATED_KEY = Number.MAX_SAFE_INTEGER;

/** What the one-time backfill needs to read off an existing event. */
export interface ClassifiableEvent {
	date: string;
	type: string;
	people: string[];
	source: string;
	hideFromDashboard: boolean;
}

/**
 * Which variant an event that predates the field should get.
 *
 * Provenance is already lost for these — an event logged from someone's
 * timeline looks exactly like one you put on your calendar — so this
 * reads the shape instead: something dated in the past, with people
 * attached, is overwhelmingly a record of that hangout rather than a
 * reminder you set yourself.
 *
 * Deliberately generous about what stays a reminder:
 *   - a task is always yours, even when it names someone
 *   - anything still ahead is a plan, not a memory
 *   - anything person-less is your own calendar entry
 * Getting it wrong the safe way means an extra row on the Events page,
 * which you can see and fix; the other way round it just disappears.
 */
export function classifyExistingEvent(
	e: ClassifiableEvent,
	now: Date
): EventVariant {
	// Nobody on it means no timeline to live on, so "timeline" would leave
	// it nowhere at all — outranks every other signal, including an old
	// hide, which under the previous scheme orphaned it the same way.
	if (e.people.length === 0) return "reminder";
	// An explicit hide is a decision you already made — honour it.
	if (e.hideFromDashboard) return "timeline";
	// Logged from a diary entry: a record of what happened, by definition.
	if (e.source) return "timeline";
	if (e.type === "task") return "reminder";
	const f = parseFlexDate(e.date);
	if (!f || isFlexUpcoming(f, now)) return "reminder";
	return "timeline";
}

/** A YYYY-MM-DD stamp as a comparable number; null when unusable. */
function stampKey(stamp: string): number | null {
	const f = parseFlexDate(stamp);
	return f ? flexSortKey(f) : null;
}

/**
 * Order the list. Purely an ordering — which half of the timeline you're
 * looking at is the Upcoming/Past filter's job now, so a caller can ask
 * for past events newest-first or oldest-first as it likes.
 */
export function applyEventSort<T extends SortableEvent>(
	list: readonly T[],
	sort: EventSort
): T[] {
	const keys = new Map<string, number>();
	for (const e of list) {
		const f = parseFlexDate(e.date);
		keys.set(e.file.path, f ? flexSortKey(f) : UNDATED_KEY);
	}
	const keyOf = (e: T) => keys.get(e.file.path) ?? UNDATED_KEY;
	const undated = (e: T) => (keyOf(e) === UNDATED_KEY ? 1 : 0);
	const narrowed = [...list];

	/**
	 * Order by a YYYY-MM-DD stamp — `dir` 1 for most-recent-first, -1 for
	 * oldest-first. An unstamped note sinks either way, so the direction
	 * must not be applied to that branch: negating it would float the
	 * unknowns to the top instead.
	 */
	const byStamp = (
		a: T,
		b: T,
		pick: (e: T) => string,
		dir: 1 | -1
	): number => {
		const ka = stampKey(pick(a));
		const kb = stampKey(pick(b));
		if (ka === null || kb === null) {
			return (ka === null ? 1 : 0) - (kb === null ? 1 : 0);
		}
		return dir * (kb - ka);
	};

	return narrowed.sort((a, b) => {
		switch (sort) {
			case "newest": {
				// Undated still sinks, so the flip can't float it to the top.
				const u = undated(a) - undated(b);
				if (u !== 0) return u;
				return keyOf(b) - keyOf(a) || byName(a, b);
			}
			case "oldest":
				// Deliberately the note's creation stamp, not the event's
				// date: "Oldest" here means the longest-standing entry, which
				// is a different question from what happened longest ago
				// (that's Newest reversed).
				return byStamp(a, b, (e) => e.created, -1) || byName(a, b);
			case "updated":
				return byStamp(a, b, (e) => e.updated, 1) || byName(a, b);
			case "nameAsc":
				return byName(a, b);
			case "nameDesc":
				return byName(b, a);
			case "type": {
				const rank = typeRank(a.type) - typeRank(b.type);
				// Within a type, name keeps it readable (and stable).
				return rank !== 0 ? rank : byName(a, b);
			}
			default: {
				// "Natural": chronological, so the next thing leads under
				// Upcoming and the list reads as a timeline under All.
				// Under the Past filter that reads oldest-first; "Newest"
				// is the one to pick for most-recent-first there.
				const u = undated(a) - undated(b);
				if (u !== 0) return u;
				// Everything tied — name keeps the order stable rather than
				// letting it drift between renders.
				return keyOf(a) - keyOf(b) || byName(a, b);
			}
		}
	});
}
