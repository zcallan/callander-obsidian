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
 * move a date users already see on the dashboard.
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

	const occurrence = new Date(
		today.getFullYear(),
		parsed.month - 1,
		parsed.day ?? 1
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
		const occurrence = new Date(
			opens.getFullYear(),
			parsed.month - 1,
			parsed.day ?? 1
		);
		occurrence.setHours(0, 0, 0, 0);
		if (occurrence < opens) {
			occurrence.setFullYear(opens.getFullYear() + 1);
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
			days: Math.round(
				(occurrence.getTime() - today.getTime()) / 86_400_000
			),
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

/** Local YYYY-MM-DD — never toISOString, which shifts to UTC. */
function isoDay(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthKey(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
