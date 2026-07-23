/**
 * FlexDate — dates with honest imprecision (Callander principle #2).
 *
 * A FlexDate can be known to the year ("2019"), the month ("2019-03"),
 * the exact day ("2019-03-14"), or — for birthdays where the year is
 * unknown — just month and day ("03-14"). It is always displayed at the
 * precision it was recorded, never pretending to know more.
 */

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
 * Numeric sort key for chronological ordering. Coarser dates sort before
 * finer ones within the same period ("2026" < "2026-05" < "2026-05-12").
 */
export function flexSortKey(date: FlexDate): number {
	return (
		(date.year ?? 0) * 10000 + (date.month ?? 0) * 100 + (date.day ?? 0)
	);
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
