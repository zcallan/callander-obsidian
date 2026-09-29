import {
	ACCOMMODATION_EMOJI,
	PLAN_IDEA_CATEGORIES,
	TRAVEL_TYPE_EMOJI,
	timeSortValue,
} from "@/constants";
import type { PlanQuickIdea, PlanTimelineEntry } from "@/types";
import { draftsOf } from "@/utils/draftsMarkdown";
import { itemsOf, simpleListOf } from "@/utils/planFields";

/** One day of the itinerary. `entries` is empty for a day nothing sits on. */
export interface TimelineDay {
	day: string;
	entries: PlanTimelineEntry[];
}

/**
 * The itinerary's days, in order.
 *
 * Every day that has something on it, plus — when the plan has an exact
 * start and end — every day in that range, so a week-long trip reads
 * day-by-day rather than skipping the quiet ones. `rangeDays` is passed in
 * already expanded; an empty list means the plan has no exact span and only
 * the days with items appear.
 *
 * Entries keep the order they arrive in: `timelineOf` has already sorted
 * them chronologically, and re-sorting here would be a second opinion on
 * the same question.
 */
export function buildTimelineDays(
	entries: PlanTimelineEntry[],
	rangeDays: string[] = []
): TimelineDay[] {
	const byDay = new Map<string, PlanTimelineEntry[]>();
	for (const entry of entries) {
		const list = byDay.get(entry.date);
		if (list) list.push(entry);
		else byDay.set(entry.date, [entry]);
	}
	const days = new Set<string>([...byDay.keys(), ...rangeDays]);
	return [...days]
		.sort()
		.map((day) => ({ day, entries: byDay.get(day) ?? [] }));
}

/**
 * How many rows the timeline is about to draw.
 *
 * Day headings and empty-day placeholders count, because each takes as much
 * height as an item does — counting only the items would badly under-read a
 * two-week plan with three things in it. Used to decide whether the add
 * buttons are worth repeating at the top.
 *
 * A count rather than a measurement: reading heights would mean rendering,
 * measuring, then inserting — a visible reflow on every refresh, to answer a
 * question this settles well enough.
 */
export function timelineRowCount(
	days: TimelineDay[],
	undatedCount: number
): number {
	const undatedRows = undatedCount > 0 ? 1 + undatedCount : 0;
	return (
		undatedRows +
		days.reduce((n, d) => n + 1 + Math.max(1, d.entries.length), 0)
	);
}

/** Beyond roughly a screenful, the add buttons are repeated at the top. */
export const LONG_TIMELINE_ROWS = 10;

/**
 * Quick ideas arranged for display: a group per category, then "Other"
 * for whatever carries none.
 *
 * An idea with several categories appears under each of them — that's the
 * point of the field, not a bug to dedupe. Each entry keeps the idea's
 * real index so a row in any group routes an edit back to the one object.
 *
 * Categories are ordered by first appearance rather than alphabetically:
 * the order you added them in is the order you think about them, and
 * "Other" is always last because it isn't a category at all.
 */
export function groupQuickIdeas(
	ideas: PlanQuickIdea[]
): { label: string; entries: { idea: PlanQuickIdea; index: number }[] }[] {
	const groups = new Map<
		string,
		{ idea: PlanQuickIdea; index: number }[]
	>();
	const uncategorised: { idea: PlanQuickIdea; index: number }[] = [];

	ideas.forEach((idea, index) => {
		const cats = (idea.categories ?? []).filter(Boolean);
		if (cats.length === 0) {
			uncategorised.push({ idea, index });
			return;
		}
		for (const cat of cats) {
			const list = groups.get(cat);
			if (list) list.push({ idea, index });
			else groups.set(cat, [{ idea, index }]);
		}
	});

	const out = [...groups.entries()].map(([label, entries]) => ({
		label,
		entries,
	}));
	// Only worth a heading of its own when something else is grouped —
	// a list where nothing is categorised is just a list.
	if (uncategorised.length > 0) {
		out.push({
			label: out.length > 0 ? "Other" : "",
			entries: uncategorised,
		});
	}
	return out;
}

/**
 * Ideas with no day yet, shaped as timeline rows.
 *
 * `date` is deliberately empty: these sit *above* the itinerary under
 * their own heading rather than in it. They're the same objects
 * underneath, with `index` pointing at the plan's own items list, so a
 * row routes an edit or a delete through exactly the path a dated one
 * does — nothing downstream needs to know the difference.
 */
export function undatedIdeaEntries(metadata: unknown): PlanTimelineEntry[] {
	const entries: PlanTimelineEntry[] = [];
	itemsOf(metadata).forEach((item, index) => {
		if (item.date) return;
		const cat = PLAN_IDEA_CATEGORIES.find(
			(c) => c.id === item.category
		);
		entries.push({
			source: "idea",
			index,
			date: "",
			...(item.time && { time: item.time }),
			...(item.people && { people: item.people }),
			text: item.text,
			emoji: cat?.emoji ?? "💡",
			...(item.category && { category: item.category }),
			...(item.priority && { priority: item.priority }),
			...(item.location && { location: item.location }),
			...(item.cost !== undefined && { cost: item.cost }),
			...(item.notes && { notes: item.notes }),
		});
	});
	return entries;
}

/**
 * Derived, read-only itinerary: every dated item across ideas, travel and
 * accommodation, sorted chronologically. Pure — computed on demand, never
 * stored. `index` is the position in each item's own source list, so the
 * caller can route an edit/delete straight back to the one real object.
 */
export function timelineOf(metadata: unknown): PlanTimelineEntry[] {
	const entries: PlanTimelineEntry[] = [];

	itemsOf(metadata).forEach((item, index) => {
		if (!item.date) return;
		const cat = PLAN_IDEA_CATEGORIES.find(
			(c) => c.id === item.category
		);
		entries.push({
			source: "idea",
			index,
			date: item.date,
			...(item.time && { time: item.time }),
			...(item.duration && { duration: item.duration }),
			...(item.people && { people: item.people }),
			text: item.text,
			emoji: cat?.emoji ?? "💡",
			...(item.category && { category: item.category }),
			...(item.priority && { priority: item.priority }),
			...(item.location && { location: item.location }),
			...(item.cost !== undefined && { cost: item.cost }),
			...(item.notes && { notes: item.notes }),
		});
	});

	// Drafts that have been given a day. They're unfinished by nature —
	// no category, no priority, nothing to show but the words — so they
	// carry only what a row needs, and the row marks them as drafts.
	draftsOf(metadata).forEach((draft, index) => {
		if (!draft.date) return;
		entries.push({
			source: "draft",
			index,
			date: draft.date,
			text: draft.text,
			emoji: "✏️",
		});
	});

	(["travel", "accommodation"] as const).forEach((key) => {
		simpleListOf(metadata, key).forEach(
			(item, index) => {
				if (!item.date) return;
				const isStay = key === "accommodation";
				const emoji = isStay
					? (item.stay && ACCOMMODATION_EMOJI[item.stay]) || "🛏️"
					: item.type
					? TRAVEL_TYPE_EMOJI[item.type] ?? "🧭"
					: "🧭";
				entries.push({
					source: isStay ? "accommodation" : "travel",
					index,
					date: item.date,
					// A stay has no clock time — it always closes the day.
					...(!isStay && item.time && { time: item.time }),
					...(item.people && { people: item.people }),
					text: item.text,
					emoji,
					...(!isStay &&
						item.duration && { duration: item.duration }),
					...(!isStay && item.type && { travel: item.type }),
					...(isStay && item.stay && { stay: item.stay }),
					...(isStay && item.nights && { nights: item.nights }),
					...(isStay &&
						item.checkIn && { checkIn: item.checkIn }),
					...(isStay &&
						item.checkOut && { checkOut: item.checkOut }),
					...(isStay && item.address && { address: item.address }),
					// A flight needs booking as much as a hotel does, so
					// this rides along for legs too — unlike address, which
					// only means something for a stay.
					...(item.booked && { booked: item.booked }),
					// Notes apply to any stay or leg, not just stays —
					// unlike address/booking, which only make sense there.
					...(item.notes && { notes: item.notes }),
					...(item.cost !== undefined && { cost: item.cost }),
				});
			}
		);
	});

	// Within a day: drafts first — they're the thoughts not yet worked
	// into the day, so they read as what's still unsettled about it —
	// then timed and untimed entries, then stays last, since you go to
	// bed after everything else. The tier digit outranks the clock.
	const tier = (e: PlanTimelineEntry) =>
		e.source === "draft" ? "0" : e.source === "accommodation" ? "2" : "1";
	const key = (e: PlanTimelineEntry) =>
		`${e.date}T${tier(e)}${timeSortValue(e.time)}`;
	return entries.sort((a, b) => key(a).localeCompare(key(b)));
}
