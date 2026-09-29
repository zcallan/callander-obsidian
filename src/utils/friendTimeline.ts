import { monthName, parseFlexDate } from "@/utils/flexdate";
import { isoDay, pad2, wholeDaysBetween } from "@/utils/dates";

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
	/**
	 * Local YYYY-MM-DD of the occurrence. When only the month is recorded
	 * this is the 1st, which is a sort position rather than a claim — see
	 * `exact`, and don't print this date without checking it.
	 */
	date: string;
	days: number;
	/** Age reached on that date, or null when the birth year is unknown. */
	turning: number | null;
	/** False when only the month is known, so the day above was assumed. */
	exact: boolean;
}

export interface BirthdayMonth<T> {
	/** "YYYY-MM" — sortable, and unique across the two Septembers a year
	 * window can contain. */
	key: string;
	/**
	 * "September", or "January 2027" once the window crosses into a year
	 * that isn't this one.
	 *
	 * Safe to leave the year off in the current one because the window is
	 * twelve *whole* months from the month we're in, so no month name can
	 * appear twice — back when it ran thirteen and held two Septembers,
	 * the year was the only thing telling them apart.
	 */
	label: string;
	entries: BirthdayEntry<T>[];
}

export interface OccurrenceOptions {
	/**
	 * Treat a birthday known only to its month as falling on the 1st.
	 *
	 * Off by default, and deliberately so: the dashboard countdown reads
	 * this as "in 12 days", and saying that about a date whose day nobody
	 * recorded would be inventing precision. It's on for the timeline and
	 * the list's birthday sort, which need only an order to put people in
	 * and label what they show honestly.
	 */
	assumeFirstOfMonth?: boolean;
}

/**
 * The next time a birthday comes round, counted from today.
 *
 * Only month and day are consulted, so a birthday recorded without a year
 * ("03-14") works exactly like one recorded with it. A birthday with no
 * month has nothing to place it by and returns null; one with a month but
 * no day does too, unless `assumeFirstOfMonth` says otherwise.
 *
 * 29 February in a non-leap year rolls into 1 March, which is what
 * `new Date(y, 1, 29)` does and what this has always done — deliberately
 * left alone rather than "fixed" to 28 February, since changing it would
 * move a date users already see on the dashboard. In a leap year it's the
 * 29th.
 */
export function nextBirthdayOccurrence(
	birthday: string,
	now: Date = new Date(),
	{ assumeFirstOfMonth = false }: OccurrenceOptions = {}
): BirthdayOccurrence | null {
	const parsed = parseFlexDate(birthday);
	if (!parsed || parsed.month === null) return null;
	if (parsed.day === null && !assumeFirstOfMonth) return null;

	const today = new Date(now);
	today.setHours(0, 0, 0, 0);

	let occurrence = new Date(
		today.getFullYear(),
		parsed.month - 1,
		parsed.day ?? 1
	);
	occurrence.setHours(0, 0, 0, 0);
	// Already been and gone this year — the next one is next year's.
	if (occurrence < today) {
		// Rebuilt from the stored month and day, not moved with setFullYear:
		// a 29 February already rolled to 1 March would stay there.
		occurrence = new Date(
			today.getFullYear() + 1,
			parsed.month - 1,
			parsed.day ?? 1
		);
	}

	return {
		date: isoDay(occurrence),
		days: wholeDaysBetween(today, occurrence),
	};
}

/**
 * Birthdays across a year of whole calendar months, starting with the one
 * we're in.
 *
 * Whole months, rather than the next 365 days: the current month is shown
 * complete, so on 20 September a birthday on the 10th is still there,
 * above today rather than banished eleven months down the page. It reads
 * as a calendar, which is what a month heading promises.
 *
 * The cost of that is `days` going negative for a birthday already past
 * this month, and callers should say "Turned" rather than "Turning" when
 * it does. The gain is exactly twelve buckets, with no second September
 * at the bottom holding the people the first one couldn't take.
 *
 * Note this deliberately does NOT use `nextBirthdayOccurrence` — that
 * answers "when is it next", which is the right question for a countdown
 * and the wrong one here, since it would push the earlier half of the
 * current month a year out.
 *
 * Every month is returned including the empty ones: the timeline renders
 * the year as a continuous span, so a quiet month is a heading with
 * nothing under it rather than a gap.
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
	windowMonths = 12
): Array<BirthdayMonth<T>> {
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	// The window opens on the 1st, which is the whole point — everything
	// below keys off it rather than off today.
	const opens = new Date(today.getFullYear(), today.getMonth(), 1);

	const months = new Map<string, BirthdayMonth<T>>();
	const cursor = new Date(opens);
	for (let i = 0; i < Math.max(1, windowMonths); i++) {
		const key = monthKey(cursor);
		const name = monthName(cursor.getMonth() + 1);
		months.set(key, {
			key,
			label:
				cursor.getFullYear() === today.getFullYear()
					? name
					: `${name} ${cursor.getFullYear()}`,
			entries: [],
		});
		cursor.setMonth(cursor.getMonth() + 1);
	}

	for (const person of people) {
		const parsed = parseFlexDate(person.birthday);
		// A month is enough to place someone. Only the day is missing, and
		// the month heading is the answer the timeline is giving anyway —
		// leaving them out of their own month to sit under "Unknown" was
		// the less honest of the two.
		if (!parsed || parsed.month === null) continue;
		const exact = parsed.day !== null;

		// This year's, unless that fell before the window opened — in which
		// case it belongs to the far end of the window, next year. A month
		// without a day sorts as the 1st, which is a position in the list
		// rather than a claim about the date; `exact` carries that on.
		let occurrence = new Date(
			opens.getFullYear(),
			parsed.month - 1,
			parsed.day ?? 1
		);
		occurrence.setHours(0, 0, 0, 0);
		if (occurrence < opens) {
			occurrence = new Date(
				opens.getFullYear() + 1,
				parsed.month - 1,
				parsed.day ?? 1
			);
		}

		// Membership decides the window rather than any day count: 29 Feb
		// lands on 1 March in a common year, and whether to keep it is the
		// same question as whether there's a heading for it.
		const month = months.get(monthKey(occurrence));
		if (!month) continue;

		month.entries.push({
			person,
			exact,
			date: isoDay(occurrence),
			days: wholeDaysBetween(today, occurrence),
			// From the years themselves rather than a stored age, which is
			// "age today" and is already a year out on the morning of the
			// birthday itself.
			turning:
				parsed.year != null
					? occurrence.getFullYear() - parsed.year
					: null,
		});
	}

	for (const month of months.values()) {
		month.entries.sort((a, b) => a.days - b.days);
	}
	return [...months.values()];
}

/**
 * Where a birthday sits in the calendar year, as a sortable number.
 *
 * Month and day only, deliberately: this is the "Jan-Dec" ordering, which
 * asks where in the year a birthday falls, not how soon it comes round.
 * The two genuinely differ — on 20 September, "next birthday" opens with
 * late September and closes with early September, while this opens with
 * January whatever today is.
 *
 * A birthday known only to its month still has a place in that order and
 * sorts to the head of its month. One with no month at all — a bare year,
 * or nothing recorded — has no place, and returns null for the caller to
 * put wherever it puts unknowns.
 */
export function calendarBirthdayKey(birthday: string): number | null {
	const parsed = parseFlexDate(birthday);
	if (!parsed || parsed.month === null) return null;
	return parsed.month * 100 + (parsed.day ?? 0);
}

function monthKey(d: Date): string {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/**
 * Month (1-12) → people whose birthday is that month with no day recorded,
 * in the order they arrived.
 *
 * A calendar cell is a day, so a birthday known only to its month can't be
 * drawn in a square without inventing the square. The timeline solves that
 * by saying "Unknown day" on the row; a grid has no row to say it on, so
 * these come back for the caller to list under the month. Day-precise
 * birthdays go through birthdaysOnDays instead, which knows the year on
 * screen and so where 29 February falls.
 *
 * Anyone with no month at all is absent — there is nothing to place them
 * by, and the B'day Timeline's Unknown birthdays section is where they're
 * accounted for.
 */
export function monthOnlyBirthdays<T extends DatedPerson>(
	people: readonly T[]
): Map<number, T[]> {
	const monthOnly = new Map<number, T[]>();
	for (const person of people) {
		const parsed = parseFlexDate(person.birthday);
		if (parsed?.month != null && parsed.day === null) {
			push(monthOnly, parsed.month, person);
		}
	}
	return monthOnly;
}

function push<K, T>(map: Map<K, T[]>, key: K, value: T) {
	const list = map.get(key);
	if (list) list.push(value);
	else map.set(key, [value]);
}

/**
 * Whose birthday falls on each of `days` (local YYYY-MM-DDs), for a calendar
 * that shows real dates rather than one year's worth of MM-DDs.
 *
 * Each birthday lands where nextBirthdayOccurrence would put it in that
 * year, so the calendar and the countdowns never disagree — including 29
 * February, which rolls into 1 March in a year without one. Only
 * day-precise birthdays have a square to sit in; a month-only one has none.
 *
 * A grid can span a new year (late December into January), so every year
 * the days touch is tried, not just the first.
 */
export function birthdaysOnDays<T extends DatedPerson>(
	people: readonly T[],
	days: readonly string[]
): Map<string, T[]> {
	const wanted = new Set(days);
	const years = [...new Set(days.map((d) => Number(d.slice(0, 4))))];
	const byDay = new Map<string, T[]>();
	for (const person of people) {
		const parsed = parseFlexDate(person.birthday);
		if (!parsed || parsed.month === null || parsed.day === null) continue;
		for (const year of years) {
			const date = isoDay(new Date(year, parsed.month - 1, parsed.day));
			if (wanted.has(date)) push(byDay, date, person);
		}
	}
	return byDay;
}

/**
 * The age a birthday brings, as a calendar says it: "Turns 31" where
 * there's room, or just "31" inside a phone's calendar square, where a
 * handful of characters is all there is and the cake beside it already
 * says whose birthday it is.
 */
export function turnsLabel(age: number, compact = false): string {
	return compact ? String(age) : `Turns ${age}`;
}
