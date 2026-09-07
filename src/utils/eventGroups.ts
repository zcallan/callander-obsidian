import { monthName, parseFlexDate } from "@/utils/flexdate";

/** One heading on the Events timeline, and what sits under it. */
export interface EventGroup<T> {
	/**
	 * Sort key: the local YYYY-MM-DD the group opens on. Empty string for
	 * the undated group, which therefore leads.
	 */
	key: string;
	/** "This week", "Later this month", "October", "September 2027". */
	label: string;
	items: T[];
}

/** The group anything without a day-precise date falls into. */
export const UNDATED_KEY = "";
const UNDATED_LABEL = "No exact date";

/**
 * The Monday of the week containing `d`, at local midnight.
 *
 * Monday rather than Sunday: the rest of the plugin formats dates as en-AU,
 * where the week starts on Monday, and a weekend split across two headings
 * reads badly on a page mostly used to look at what's coming up.
 */
export function weekStart(d: Date): Date {
	const start = new Date(d);
	start.setHours(0, 0, 0, 0);
	// getDay is 0 for Sunday, which is 6 days *after* the Monday it belongs to.
	const back = (start.getDay() + 6) % 7;
	start.setDate(start.getDate() - back);
	return start;
}

/**
 * Which heading a date belongs under, relative to today.
 *
 * The near future is named by how soon it is — "This week", "Next week",
 * "Later this month" — because that's how you actually think about it. Past
 * that, months are enough, and naming a month twelve times is more useful
 * than naming fifty-two weeks.
 *
 * The year appears whenever the date isn't in the current one. That is what
 * keeps "September" from meaning two different things in a list that runs
 * both ways, and it happens to fall exactly where you'd want it: a year out
 * is where a bare month name stops being enough to place something.
 *
 * The page's Past and All modes mean this runs backwards too. "This week"
 * and "Earlier this month" cover a date behind today; anything further back
 * is a month like any other, carrying its year once it leaves this one.
 */
export interface PeriodOptions {
	/**
	 * Put the year on every month heading, even one in the current year.
	 *
	 * For a view that runs backwards: "August 2025" beside a bare "August"
	 * reads as two different kinds of thing when they're both just months
	 * that have been. Looking forwards the bare form is the nicer one, so
	 * this is the caller's call rather than a rule here.
	 */
	alwaysYear?: boolean;
}

export function eventPeriod(
	date: string,
	now: Date = new Date(),
	{ alwaysYear = false }: PeriodOptions = {}
): { key: string; label: string } {
	const parsed = parseFlexDate(date);
	const dayPrecise =
		parsed &&
		parsed.year !== null &&
		parsed.month !== null &&
		parsed.day !== null;
	if (!dayPrecise) return { key: UNDATED_KEY, label: UNDATED_LABEL };

	const on = new Date(
		parsed.year as number,
		(parsed.month as number) - 1,
		parsed.day as number
	);
	on.setHours(0, 0, 0, 0);

	const thisWeek = weekStart(now);
	const nextWeek = new Date(thisWeek);
	nextWeek.setDate(nextWeek.getDate() + 7);
	const afterNextWeek = new Date(thisWeek);
	afterNextWeek.setDate(afterNextWeek.getDate() + 14);

	if (on >= thisWeek && on < nextWeek) {
		return { key: isoDay(thisWeek), label: "This week" };
	}
	if (on >= nextWeek && on < afterNextWeek) {
		return { key: isoDay(nextWeek), label: "Next week" };
	}

	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	const sameMonth =
		on.getFullYear() === today.getFullYear() &&
		on.getMonth() === today.getMonth();
	if (sameMonth) {
		// Beyond next week but still this month, or behind this week and
		// still this month — either way it's this month's business.
		return on >= afterNextWeek
			? { key: isoDay(afterNextWeek), label: "Later this month" }
			: {
					key: isoDay(new Date(on.getFullYear(), on.getMonth(), 1)),
					label: "Earlier this month",
			  };
	}

	const first = new Date(on.getFullYear(), on.getMonth(), 1);
	const name = monthName(on.getMonth() + 1);
	return {
		key: isoDay(first),
		label:
			!alwaysYear && on.getFullYear() === today.getFullYear()
				? name
				: `${name} ${on.getFullYear()}`,
	};
}

/**
 * Events under those headings, earliest first.
 *
 * Only groups that hold something are returned. This follows the page's
 * Upcoming / Past / All mode, and on Past that reaches back years — drawing
 * every quiet month between then and now would bury the real ones.
 *
 * Anything not known to the day leads, following the plan timeline's "Needs
 * date": an item still waiting on a decision is the one that gets forgotten
 * if it's filed at the bottom.
 *
 * Order within a group is whatever order the caller passed, so a page that
 * has already sorted its events keeps that sort inside each heading.
 *
 * Structural rather than typed against EventInfo: it needs no TFile, so the
 * unit suite can exercise it against plain objects.
 */
export function groupEventsByPeriod<T>(
	items: readonly T[],
	dateOf: (item: T) => string,
	now: Date = new Date(),
	options: PeriodOptions = {}
): Array<EventGroup<T>> {
	const groups = new Map<string, EventGroup<T>>();

	for (const item of items) {
		const { key, label } = eventPeriod(dateOf(item), now, options);
		const group = groups.get(key);
		if (group) group.items.push(item);
		else groups.set(key, { key, label, items: [item] });
	}

	// The undated key is the empty string, which sorts before every date —
	// exactly where it belongs, so it needs no special case.
	return [...groups.values()].sort((a, b) =>
		a.key < b.key ? -1 : a.key > b.key ? 1 : 0
	);
}

/** Local YYYY-MM-DD — never toISOString, which shifts to UTC. */
function isoDay(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
