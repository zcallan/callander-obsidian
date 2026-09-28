/**
 * Calendar arithmetic and storage keys, in local time. How a date is shown
 * lives in dateFormat.ts (the house style); this is what's underneath it.
 */

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
// Module-private on purpose: adding it to a Date *is* the daylight-saving
// bug. Count days with wholeDaysBetween, and move by days with setDate.
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** 7 → "07". */
export function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

/** "2026-09-27" from calendar fields (month 1–12). The year isn't padded. */
export function isoDateOf(year: number, month: number, day: number): string {
	return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Local YYYY-MM-DD — never toISOString, which shifts to UTC. */
export function isoDay(d: Date): string {
	return isoDateOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** "07:05" from an hour and minute. */
export function hhmm(hour: number, minute: number): string {
	return `${pad2(hour)}:${pad2(minute)}`;
}

/** A copy of `d` at 00:00 local time. */
export function startOfLocalDay(d: Date): Date {
	const copy = new Date(d);
	copy.setHours(0, 0, 0, 0);
	return copy;
}

/**
 * Whole calendar days from `from` to `to`, positive when `to` is later: so
 * (now, target) is "days until" and (past, now) is "days since". Time of day
 * is ignored, and the gap is rounded rather than floored, since a day that
 * crosses a daylight-saving change is 23 or 25 hours and still one day.
 */
export function wholeDaysBetween(from: Date, to: Date): number {
	return Math.round(
		(startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) /
			MS_PER_DAY
	);
}
