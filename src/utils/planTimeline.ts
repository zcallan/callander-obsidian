import type { PlanTimelineEntry } from "@/types";

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
