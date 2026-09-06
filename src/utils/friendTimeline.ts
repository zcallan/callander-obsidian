import { monthName, parseFlexDate } from "@/utils/flexdate";

/** When a birthday next comes round. */
export interface BirthdayOccurrence {
	/** Local YYYY-MM-DD. */
	date: string;
	/** Whole days from today; 0 is today. */
	days: number;
}

/** The minimum a person needs to appear on the timeline. */
export interface DatedPerson {
	/** Flex date, at whatever precision it was recorded. */
	birthday: string;
}

export interface BirthdayEntry<T> {
	person: T;
	/** Local YYYY-MM-DD of the occurrence. */
	date: string;
	days: number;
	/** Age reached on that date, or null when the birth year is unknown. */
	turning: number | null;
}

export interface BirthdayMonth<T> {
	/** "YYYY-MM" — sortable, and unique across the two Septembers a year
	 * window can contain. */
	key: string;
	/** "September 2026". The year is always shown: a window that wraps holds
	 * two months of the same name, and only the year tells them apart. */
	label: string;
	entries: BirthdayEntry<T>[];
}

/**
 * The next time a birthday comes round, counted from today.
 *
 * Only month and day are consulted, so a birthday recorded without a year
 * ("03-14") works exactly like one recorded with it. A birthday known only
 * to the month or the year has no day to land on and returns null.
 *
 * 29 February in a non-leap year rolls into 1 March, which is what
 * `new Date(y, 1, 29)` does and what this has always done — deliberately
 * left alone rather than "fixed" to 28 February, since changing it would
 * move a date users already see on the dashboard.
 */
export function nextBirthdayOccurrence(
	birthday: string,
	now: Date = new Date()
): BirthdayOccurrence | null {
	const parsed = parseFlexDate(birthday);
	if (!parsed || parsed.month === null || parsed.day === null) return null;

	const today = new Date(now);
	today.setHours(0, 0, 0, 0);

	const occurrence = new Date(
		today.getFullYear(),
		parsed.month - 1,
		parsed.day
	);
	occurrence.setHours(0, 0, 0, 0);
	// Already been and gone this year — the next one is next year's.
	if (occurrence < today) {
		occurrence.setFullYear(today.getFullYear() + 1);
	}

	return {
		date: isoDay(occurrence),
		days: Math.round(
			(occurrence.getTime() - today.getTime()) / 86_400_000
		),
	};
}

/**
 * Birthdays across the coming year, bucketed by calendar month.
 *
 * Every month the window touches is returned, including the empty ones —
 * the All friends timeline renders the year as a continuous span, so a
 * quiet month has to be a heading with nothing under it rather than a gap.
 *
 * That span is 12 or 13 buckets, and the 13th is the point: a birthday
 * earlier this month has already rolled to next year, so it lands in the
 * same month name twelve months out. A fixed twelve buckets would drop
 * exactly the people whose birthday just passed.
 *
 * Entries within a month are ordered by date, and same-day birthdays keep
 * the order they arrived in — pass people in alphabetically and a shared
 * birthday reads A-Z.
 *
 * Structural rather than typed against ContactWithCountdown: it needs no
 * TFile, so the unit suite can exercise it against plain objects.
 */
export function birthdayMonths<T extends DatedPerson>(
	people: readonly T[],
	now: Date = new Date(),
	windowDays = 365
): Array<BirthdayMonth<T>> {
	const start = new Date(now);
	start.setHours(0, 0, 0, 0);
	const end = new Date(start);
	end.setDate(end.getDate() + Math.max(0, windowDays - 1));

	const months = new Map<string, BirthdayMonth<T>>();
	const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
	const last = new Date(end.getFullYear(), end.getMonth(), 1);
	while (cursor <= last) {
		const key = monthKey(cursor);
		months.set(key, {
			key,
			label: `${monthName(cursor.getMonth() + 1)} ${cursor.getFullYear()}`,
			entries: [],
		});
		cursor.setMonth(cursor.getMonth() + 1);
	}

	for (const person of people) {
		const occurrence = nextBirthdayOccurrence(person.birthday, start);
		if (!occurrence) continue;
		// Membership decides the window, not the day count: a leap year can
		// put an occurrence a day past `windowDays`, and dropping it here is
		// the same question as "is there a heading for it".
		const month = months.get(occurrence.date.slice(0, 7));
		if (!month) continue;

		const parsed = parseFlexDate(person.birthday);
		const year = Number(occurrence.date.slice(0, 4));
		month.entries.push({
			person,
			date: occurrence.date,
			days: occurrence.days,
			// From the years themselves rather than a stored age, which is
			// "age today" and is already a year out on the morning of the
			// birthday itself.
			turning: parsed?.year != null ? year - parsed.year : null,
		});
	}

	for (const month of months.values()) {
		month.entries.sort((a, b) => a.days - b.days);
	}
	return [...months.values()];
}

/** Local YYYY-MM-DD — never toISOString, which shifts to UTC. */
function isoDay(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthKey(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
