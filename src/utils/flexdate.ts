/**
 * FlexDate — dates with honest imprecision (Callander principle #2).
 *
 * A FlexDate can be known to the year ("2019"), the month ("2019-03"),
 * the exact day ("2019-03-14"), or — for birthdays where the year is
 * unknown — just month and day ("03-14"). It is always displayed at the
 * precision it was recorded, never pretending to know more.
 */

import { formatDate } from "@/utils/dateFormat";

export interface FlexDate {
	year: number | null;
	month: number | null; // 1-12
	day: number | null; // 1-31
}

export type FlexPrecision = "year" | "month" | "day";

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

export function parseFlexDate(
	value: string | number | null | undefined
): FlexDate | null {
	if (value === null || value === undefined || value === "") return null;

	// YAML can hand us a bare year as a number (met: 2019)
	if (typeof value === "number") {
		if (Number.isInteger(value) && value >= 1000 && value <= 9999) {
			return { year: value, month: null, day: null };
		}
		return null;
	}

	const str = String(value).trim();

	let match = str.match(/^(\d{4})$/);
	if (match) {
		return { year: Number(match[1]), month: null, day: null };
	}

	match = str.match(/^(\d{4})-(\d{1,2})$/);
	if (match) {
		const month = Number(match[2]);
		if (month < 1 || month > 12) return null;
		return { year: Number(match[1]), month, day: null };
	}

	match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
	if (match) {
		const month = Number(match[2]);
		const day = Number(match[3]);
		if (month < 1 || month > 12 || day < 1 || day > 31) return null;
		return { year: Number(match[1]), month, day };
	}

	// Year-less month-day, e.g. a birthday where the year is unknown
	match = str.match(/^(\d{1,2})-(\d{1,2})$/);
	if (match) {
		const month = Number(match[1]);
		const day = Number(match[2]);
		if (month < 1 || month > 12 || day < 1 || day > 31) return null;
		return { year: null, month, day };
	}

	return null;
}

export function monthName(month: number): string {
	return MONTH_NAMES[month - 1] ?? "";
}

export function flexPrecision(date: FlexDate): FlexPrecision {
	if (date.day !== null) return "day";
	if (date.month !== null) return "month";
	return "year";
}

/** Canonical storage string: "2019" | "2019-03" | "2019-03-14" | "03-14" */
export function toFlexString(date: FlexDate): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	if (date.year === null) {
		if (date.month === null || date.day === null) return "";
		return `${pad(date.month)}-${pad(date.day)}`;
	}
	if (date.month === null) return String(date.year);
	if (date.day === null) return `${date.year}-${pad(date.month)}`;
	return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

/** Display at recorded precision: "2019" | "March 2019" | "March 14, 2019" | "March 14" */
export function formatFlexDate(date: FlexDate): string {
	if (date.month === null) {
		return date.year !== null ? String(date.year) : "";
	}
	const monthName = MONTH_NAMES[date.month - 1];
	if (date.day === null) {
		return date.year !== null ? `${monthName} ${date.year}` : monthName;
	}
	if (date.year === null) {
		return `${monthName} ${date.day}`;
	}
	return `${monthName} ${date.day}, ${date.year}`;
}

/**
 * Compact, day-first display at the recorded precision: "28 Nov 1997" |
 * "28 Nov" | "Nov 1997" | "Nov" | "1997".
 *
 * The month is abbreviated by hand rather than through Intl — en-AU's
 * "short" month renders "July" in full, so the locale can't be trusted
 * to actually shorten it.
 */
export function formatShortFlexDate(date: FlexDate): string {
	if (date.month === null) {
		return date.year !== null ? String(date.year) : "";
	}
	const month = MONTH_NAMES[date.month - 1].slice(0, 3);
	const parts = [
		date.day !== null ? String(date.day) : "",
		month,
		date.year !== null ? String(date.year) : "",
	];
	return parts.filter(Boolean).join(" ");
}

/**
 * "Thu 30 Jul" — a real calendar Date (not a FlexDate: this is for the
 * exact-day case only), weekday from the locale, month abbreviated by
 * hand for the same reason as formatShortFlexDate above. No year — this
 * is for a compact share/copy line, not a record meant to survive years
 * of scrollback.
 */
export function formatShortWeekdayDate(d: Date): string {
	return `${formatDate(d, { weekday: "short" })} ${d.getDate()} ${monthName(
		d.getMonth() + 1
	).slice(0, 3)}`;
}

/**
 * Numeric sort key for chronological ordering. Coarser dates sort before
 * finer ones within the same period ("2026" < "2026-05" < "2026-05-12").
 */
export function flexSortKey(date: FlexDate): number {
	return (
		(date.year ?? 0) * 10000 + (date.month ?? 0) * 100 + (date.day ?? 0)
	);
}

/**
 * Is this flex date in the future (or today)? Used to mark upcoming timeline
 * events. A year-only date in the current year reads as past; a future year,
 * a later month this year, or today-or-later this month read as upcoming.
 */
export function isFlexUpcoming(date: FlexDate, now = new Date()): boolean {
	if (date.year === null) return false;
	const y = now.getFullYear();
	if (date.year !== y) return date.year > y;
	if (date.month === null) return false;
	const m = now.getMonth() + 1;
	if (date.month !== m) return date.month > m;
	if (date.day === null) return true;
	return date.day >= now.getDate();
}

/**
 * Is this flex date in the recent past — within `months` back, but not
 * upcoming? The inverse partner to isFlexUpcoming, for "what happened
 * lately" lists.
 *
 * A coarse date is read at the start of its period (a bare "2026" counts
 * from 1 January), which errs towards dropping the vaguest entries rather
 * than showing something that may well be outside the window.
 */
export function isFlexWithinLastMonths(
	date: FlexDate,
	months: number,
	now = new Date()
): boolean {
	if (date.year === null) return false;
	if (isFlexUpcoming(date, now)) return false;
	const when = new Date(date.year, (date.month ?? 1) - 1, date.day ?? 1);
	const cutoff = new Date(now);
	cutoff.setMonth(cutoff.getMonth() - months);
	cutoff.setHours(0, 0, 0, 0);
	return when >= cutoff;
}

/**
 * Which end of a date span speaks for it, and where the span sits
 * relative to now.
 *
 * While any of it is still ahead the start is what matters ("in 3 days");
 * once the whole span is behind you the end is — a four-day trip that
 * finished yesterday reads "yesterday", not "4 days ago".
 *
 * Only a day-precision end counts: a month-precision one can't say
 * whether the span has finished, so the start keeps both jobs. Callers
 * that split past from future on `past` are guaranteed to place a span in
 * exactly one of the two, since both answers come from this one flag.
 */
export function resolveSpan(
	start: FlexDate,
	end: FlexDate | null,
	now = new Date()
): { date: FlexDate; past: boolean; underway: boolean } {
	const exactEnd =
		end && end.year !== null && end.month !== null && end.day !== null
			? end
			: null;
	const started = !isFlexUpcoming(start, now);
	const past = exactEnd ? !isFlexUpcoming(exactEnd, now) : started;
	return {
		date: past && exactEnd ? exactEnd : start,
		past,
		underway: !!exactEnd && started && !past,
	};
}

/**
 * How far off a date is, in words: "today", "in 5 days", "2 months ago",
 * "3 years ago". Reads at the date's own precision — a month-only date
 * never claims a day count — and "" without a year to measure from.
 *
 * Unlike formatTimeSince this looks forwards as well as back, and counts
 * exact days for a day-precision date, so something last week doesn't
 * round up to "1 month ago".
 */
export function formatRelativeFlex(date: FlexDate, now = new Date()): string {
	if (date.year === null) return "";

	const phrase = (n: number, unit: string) => {
		const size = Math.abs(n);
		const plural = `${size} ${unit}${size === 1 ? "" : "s"}`;
		return n < 0 ? `${plural} ago` : `in ${plural}`;
	};
	// Math.round breaks .5 towards +Infinity, so rounding the magnitude
	// keeps a date 45 days back and one 45 days ahead the same distance.
	const scale = (n: number, per: number) =>
		Math.sign(n) * Math.round(Math.abs(n) / per);

	if (date.month !== null && date.day !== null) {
		const target = new Date(date.year, date.month - 1, date.day);
		target.setHours(0, 0, 0, 0);
		const today = new Date(now);
		today.setHours(0, 0, 0, 0);
		const days = Math.round(
			(target.getTime() - today.getTime()) / 86400000
		);
		if (days === 0) return "today";
		if (days === 1) return "tomorrow";
		if (days === -1) return "yesterday";
		if (Math.abs(days) <= 30) return phrase(days, "day");
		if (Math.abs(days) < 365) return phrase(scale(days, 30), "month");
		return phrase(scale(days, 365), "year");
	}

	if (date.month !== null) {
		const months =
			(date.year - now.getFullYear()) * 12 +
			(date.month - (now.getMonth() + 1));
		if (months === 0) return "this month";
		if (Math.abs(months) < 12) return phrase(months, "month");
		return phrase(scale(months, 12), "year");
	}

	const years = date.year - now.getFullYear();
	return years === 0 ? "this year" : phrase(years, "year");
}

/**
 * Human "how long ago" at the date's own precision, e.g. "5 years ago",
 * "8 months ago", "this year". Returns "" when the year is unknown.
 */
export function formatTimeSince(date: FlexDate, now = new Date()): string {
	if (date.year === null) return "";

	const nowYear = now.getFullYear();
	const nowMonth = now.getMonth() + 1;

	if (date.month === null) {
		const years = nowYear - date.year;
		if (years <= 0) return "this year";
		return years === 1 ? "1 year ago" : `${years} years ago`;
	}

	const months = (nowYear - date.year) * 12 + (nowMonth - date.month);
	if (months < 1) return "this month";
	if (months < 12) {
		return months === 1 ? "1 month ago" : `${months} months ago`;
	}
	const years = Math.floor(months / 12);
	return years === 1 ? "1 year ago" : `${years} years ago`;
}

/** Today as a local YYYY-MM-DD stamp (for created/updated fields). */
export function todayISO(): string {
	return isoStamp(new Date());
}

/** N days from today (negative for the past), as a local YYYY-MM-DD stamp. */
export function daysFromToday(days: number): string {
	const d = new Date();
	d.setDate(d.getDate() + days);
	return isoStamp(d);
}

function isoStamp(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
