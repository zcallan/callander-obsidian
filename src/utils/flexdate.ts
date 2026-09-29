/**
 * FlexDate — dates with honest imprecision (Callander principle #2).
 *
 * A FlexDate can be known to the year ("2019"), the month ("2019-03"),
 * the exact day ("2019-03-14"), or — for birthdays where the year is
 * unknown — just month and day ("03-14"). It is always displayed at the
 * precision it was recorded, never pretending to know more.
 */

import { formatDate } from "@/utils/dateFormat";
import {
	daysInMonth,
	isoDateOf,
	isoDay,
	monthsBefore,
	pad2,
	wholeDaysBetween,
} from "@/utils/dates";
import { formatCount } from "@/utils/text";

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

	// Years outside 1000–9999 are refused, as the numeric branch refuses
	// them: "0099" would be read as 1999 by every `new Date(year, …)`.
	const inRange = (year: string) => Number(year) >= 1000;

	let match = str.match(/^(\d{4})$/);
	if (match) {
		if (!inRange(match[1])) return null;
		return { year: Number(match[1]), month: null, day: null };
	}

	match = str.match(/^(\d{4})-(\d{1,2})$/);
	if (match) {
		const month = Number(match[2]);
		if (!inRange(match[1]) || month < 1 || month > 12) return null;
		return { year: Number(match[1]), month, day: null };
	}

	match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
	if (match) {
		const year = Number(match[1]);
		const month = Number(match[2]);
		const day = Number(match[3]);
		if (!inRange(match[1]) || month < 1 || month > 12) return null;
		if (day < 1 || day > daysInMonth(year, month)) return null;
		return { year, month, day };
	}

	// Year-less month-day, e.g. a birthday where the year is unknown
	match = str.match(/^(\d{1,2})-(\d{1,2})$/);
	if (match) {
		const month = Number(match[1]);
		const day = Number(match[2]);
		if (month < 1 || month > 12) return null;
		// No year, so 29 February has to be allowed: measured in a leap year.
		if (day < 1 || day > daysInMonth(2000, month)) return null;
		return { year: null, month, day };
	}

	return null;
}

export function monthName(month: number): string {
	return MONTH_NAMES[month - 1] ?? "";
}

/**
 * "Jul": the month abbreviated by hand rather than through Intl, since
 * en-AU's "short" month renders "July" in full — the locale can't be
 * trusted to actually shorten it.
 */
export function shortMonthName(month: number): string {
	return monthName(month).slice(0, 3);
}

/** A FlexDate known to the day. */
export interface ExactFlexDate extends FlexDate {
	year: number;
	month: number;
	day: number;
}

/** True when year, month and day are all known. */
export function isExactFlexDate(
	date: FlexDate | null | undefined
): date is ExactFlexDate {
	return (
		!!date && date.year !== null && date.month !== null && date.day !== null
	);
}

/** The local Date an exact FlexDate names, at midnight. */
export function flexToLocalDate(date: ExactFlexDate): Date {
	return new Date(date.year, date.month - 1, date.day);
}

export function flexPrecision(date: FlexDate): FlexPrecision {
	if (date.day !== null) return "day";
	if (date.month !== null) return "month";
	return "year";
}

/** Canonical storage string: "2019" | "2019-03" | "2019-03-14" | "03-14" */
export function toFlexString(date: FlexDate): string {
	if (date.year === null) {
		if (date.month === null || date.day === null) return "";
		return `${pad2(date.month)}-${pad2(date.day)}`;
	}
	if (date.month === null) return String(date.year);
	if (date.day === null) return `${date.year}-${pad2(date.month)}`;
	return isoDateOf(date.year, date.month, date.day);
}

/**
 * Display at recorded precision, in the house style (day first, no comma,
 * as dateFormat.ts): "2019" | "March 2019" | "14 March 2019" | "14 March".
 */
export function formatFlexDate(date: FlexDate): string {
	if (date.month === null) {
		return date.year !== null ? String(date.year) : "";
	}
	const month = monthName(date.month);
	if (date.day === null) {
		return date.year !== null ? `${month} ${date.year}` : month;
	}
	if (date.year === null) {
		return `${date.day} ${month}`;
	}
	return `${date.day} ${month} ${date.year}`;
}

/**
 * Compact, day-first display at the recorded precision: "28 Nov 1997" |
 * "28 Nov" | "Nov 1997" | "Nov" | "1997".
 */
export function formatShortFlexDate(date: FlexDate): string {
	if (date.month === null) {
		return date.year !== null ? String(date.year) : "";
	}
	const month = shortMonthName(date.month);
	const parts = [
		date.day !== null ? String(date.day) : "",
		month,
		date.year !== null ? String(date.year) : "",
	];
	return parts.filter(Boolean).join(" ");
}

/**
 * "Thu 30 Jul" — a real calendar Date (not a FlexDate: this is for the
 * exact-day case only), weekday from the locale, month from
 * shortMonthName. No year — this
 * is for a compact share/copy line, not a record meant to survive years
 * of scrollback.
 */
export function formatShortWeekdayDate(d: Date): string {
	const weekday = formatDate(d, { weekday: "short" });
	return `${weekday} ${d.getDate()} ${shortMonthName(d.getMonth() + 1)}`;
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
	const cutoff = monthsBefore(now, months);
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
	const exactEnd = isExactFlexDate(end) ? end : null;
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
		const counted = formatCount(Math.abs(n), unit);
		return n < 0 ? `${counted} ago` : `in ${counted}`;
	};
	// Math.round breaks .5 towards +Infinity, so rounding the magnitude
	// keeps a date 45 days back and one 45 days ahead the same distance.
	const scale = (n: number, per: number) =>
		Math.sign(n) * Math.round(Math.abs(n) / per);

	if (isExactFlexDate(date)) {
		const days = wholeDaysBetween(now, flexToLocalDate(date));
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
		return `${formatCount(years, "year")} ago`;
	}

	const months = (nowYear - date.year) * 12 + (nowMonth - date.month);
	if (months < 1) return "this month";
	if (months < 12) {
		return `${formatCount(months, "month")} ago`;
	}
	const years = Math.floor(months / 12);
	return `${formatCount(years, "year")} ago`;
}

/** Today as a local YYYY-MM-DD stamp (for created/updated fields). */
export function todayISO(): string {
	return isoDay(new Date());
}

