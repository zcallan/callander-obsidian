import { monthName } from "@/utils/flexdate";
import { weekStart } from "@/utils/eventGroups";

/** One cell of the calendar. */
export interface CalendarDay {
	/** Local YYYY-MM-DD — the key everything else is looked up by. */
	date: string;
	/** Day of the month, 1-31. */
	day: number;
	/**
	 * False for the days a month grid borrows from its neighbours to fill
	 * the first and last rows. They're still real days and still clickable;
	 * they just belong to another month and are drawn back.
	 */
	inMonth: boolean;
	isToday: boolean;
}

/**
 * The days a month grid draws, Monday first.
 *
 * As many whole weeks as the month actually touches — five for most, six
 * when a 31-day month opens late in the week, four for a non-leap February
 * that opens on a Monday. A fixed six rows would leave a wholly empty row
 * on most months; letting it vary costs a little height jump when you page
 * between months, which is the cheaper of the two.
 *
 * Monday first for the same reason the timeline groups by Monday weeks: the
 * plugin formats dates as en-AU throughout, and a weekend split across two
 * rows reads badly.
 */
export function monthGrid(cursor: Date, now: Date = new Date()): CalendarDay[] {
	const year = cursor.getFullYear();
	const month = cursor.getMonth();
	const first = weekStart(new Date(year, month, 1));
	const last = weekStart(new Date(year, month + 1, 0));

	const days: CalendarDay[] = [];
	const walk = new Date(first);
	// `last` is the Monday of the week holding the month's final day, so the
	// loop closes after drawing that week out to its Sunday.
	while (walk <= last) {
		for (let i = 0; i < 7; i++) {
			days.push(dayOf(walk, now, walk.getMonth() === month));
			walk.setDate(walk.getDate() + 1);
		}
	}
	return days;
}

/** The seven days of the week containing `cursor`, Monday first. */
export function weekGrid(cursor: Date, now: Date = new Date()): CalendarDay[] {
	const walk = weekStart(cursor);
	const days: CalendarDay[] = [];
	for (let i = 0; i < 7; i++) {
		days.push(dayOf(walk, now, true));
		walk.setDate(walk.getDate() + 1);
	}
	return days;
}

/** "September 2026" — the year always, since you can page years away. */
export function monthLabel(cursor: Date): string {
	return `${monthName(cursor.getMonth() + 1)} ${cursor.getFullYear()}`;
}

/**
 * "7 – 13 September 2026", collapsing what the two ends share:
 * "28 September – 4 October 2026" across a month, and
 * "28 December 2026 – 3 January 2027" across a new year.
 */
export function weekLabel(cursor: Date): string {
	const start = weekStart(cursor);
	const end = new Date(start);
	end.setDate(end.getDate() + 6);

	const sameYear = start.getFullYear() === end.getFullYear();
	const sameMonth = sameYear && start.getMonth() === end.getMonth();
	const from = sameMonth
		? String(start.getDate())
		: `${start.getDate()} ${monthName(start.getMonth() + 1)}${
				sameYear ? "" : ` ${start.getFullYear()}`
		  }`;
	// En dash, spaced — the same range mark the plan pages use.
	return `${from} – ${end.getDate()} ${monthName(
		end.getMonth() + 1
	)} ${end.getFullYear()}`;
}

/**
 * Events keyed by the day they fall on, ready for a grid to look up.
 *
 * Only day-precise dates get a key: a month-only event has no cell to sit
 * in, and putting it on the 1st would be inventing a day. Those stay
 * visible on the Timeline and List tabs, which can say "No exact date".
 *
 * Within a day, anything untimed leads. That's the all-day convention every
 * calendar uses, and it matches what "Anytime" means here — actionable
 * whenever, rather than at some hour that sorts oddly against the rest.
 *
 * Structural rather than typed against EventInfo: it needs no TFile, so the
 * unit suite can exercise it against plain objects.
 */
export function eventsByDay<T>(
	items: readonly T[],
	dateOf: (item: T) => string,
	timeOf: (item: T) => string = () => ""
): Map<string, T[]> {
	const byDay = new Map<string, T[]>();
	for (const item of items) {
		const date = dateOf(item);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
		const list = byDay.get(date);
		if (list) list.push(item);
		else byDay.set(date, [item]);
	}
	for (const list of byDay.values()) {
		list.sort((a, b) => {
			const ta = timeOf(a);
			const tb = timeOf(b);
			if (!ta && !tb) return 0;
			if (!ta) return -1;
			if (!tb) return 1;
			return ta.localeCompare(tb);
		});
	}
	return byDay;
}

function dayOf(d: Date, now: Date, inMonth: boolean): CalendarDay {
	return {
		date: isoDay(d),
		day: d.getDate(),
		inMonth,
		isToday: isoDay(d) === isoDay(now),
	};
}

/** Local YYYY-MM-DD — never toISOString, which shifts to UTC. */
function isoDay(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
