/**
 * Calendar arithmetic and storage keys, in local time. How a date is shown
 * lives in dateFormat.ts (the house style); this is what's underneath it.
 */

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
// Module-private on purpose: adding it to a Date *is* the daylight-saving
// bug. Count days with wholeDaysBetween, and move by days with setDate.
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** A safety cap on walking a day range one day at a time: over a year. */
export const MAX_DAY_WALK = 400;

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

/**
 * Every local day from `startISO` to `endISO` inclusive, as YYYY-MM-DD.
 * Empty when either doesn't parse or the range runs backwards; capped at
 * MAX_DAY_WALK days.
 */
export function isoDaysBetween(startISO: string, endISO: string): string[] {
	const days: string[] = [];
	const d = new Date(`${startISO}T00:00:00`);
	const end = new Date(`${endISO}T00:00:00`);
	if (isNaN(d.getTime()) || isNaN(end.getTime()) || end < d) return days;
	let guard = 0;
	while (d <= end && guard++ < MAX_DAY_WALK) {
		days.push(isoDay(d));
		d.setDate(d.getDate() + 1);
	}
	return days;
}

/** Days in a month (1–12) of a year. */
export function daysInMonth(year: number, month: number): number {
	return new Date(year, month, 0).getDate();
}

/**
 * The 1st of the month `by` months from `cursor`'s. Paging by setMonth on
 * the 29th–31st overflows: from 31 October, +1 is "31 November", which is
 * 1 December, and from 31 March, -1 is 3 March.
 */
export function monthStep(cursor: Date, by: number): Date {
	return new Date(cursor.getFullYear(), cursor.getMonth() + by, 1);
}

/** The same day `months` months before `d`, clamped to that month's length. */
export function monthsBefore(d: Date, months: number): Date {
	const first = new Date(d.getFullYear(), d.getMonth() - months, 1);
	const day = Math.min(
		d.getDate(),
		daysInMonth(first.getFullYear(), first.getMonth() + 1)
	);
	return new Date(first.getFullYear(), first.getMonth(), day);
}

/**
 * A local Date for a YYYY-MM-DD string, or null for anything else. A bare
 * `new Date(x + "T00:00:00")` also accepts "2026-07", as 1 July.
 */
export function localDateOfIso(iso: string | undefined): Date | null {
	if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
	const d = new Date(`${iso}T00:00:00`);
	return isNaN(d.getTime()) ? null : d;
}

