import { specialEventTime } from "@/constants";
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
 * The days a month grid draws, opening on `startsOn`.
 *
 * As many whole weeks as the month actually touches — five for most, six
 * when a 31-day month opens late in the week, four for a non-leap February
 * that opens on a Monday. A fixed six rows would leave a wholly empty row
 * on most months; letting it vary costs a little height jump when you page
 * between months, which is the cheaper of the two.
 *
 * Monday by default, for the same reason the timeline groups by Monday
 * weeks: the plugin formats dates as en-AU throughout, and a weekend split
 * across two rows reads badly. A setting moves it to Sunday.
 */
export function monthGrid(
	cursor: Date,
	now: Date = new Date(),
	startsOn: 0 | 1 = 1
): CalendarDay[] {
	const year = cursor.getFullYear();
	const month = cursor.getMonth();
	const first = weekStart(new Date(year, month, 1), startsOn);
	const last = weekStart(new Date(year, month + 1, 0), startsOn);

	const days: CalendarDay[] = [];
	const walk = new Date(first);
	// `last` opens the week holding the month's final day, so the loop
	// closes after drawing that week out in full.
	while (walk <= last) {
		for (let i = 0; i < 7; i++) {
			days.push(dayOf(walk, now, walk.getMonth() === month));
			walk.setDate(walk.getDate() + 1);
		}
	}
	return days;
}

/** The seven days of the week containing `cursor`, opening on `startsOn`. */
export function weekGrid(
	cursor: Date,
	now: Date = new Date(),
	startsOn: 0 | 1 = 1
): CalendarDay[] {
	const walk = weekStart(cursor, startsOn);
	const days: CalendarDay[] = [];
	for (let i = 0; i < 7; i++) {
		days.push(dayOf(walk, now, true));
		walk.setDate(walk.getDate() + 1);
	}
	return days;
}

/**
 * "September 2026" — the year always, since you can page years away.
 *
 * `short` gives "Sep 2026". A phone's calendar bar holds this beside four
 * buttons, and September is nine characters: at full length it pushed them
 * onto a second row, which moved the grid down the screen every time the
 * month happened to have a long name.
 */
export function monthLabel(cursor: Date, short = false): string {
	const name = monthName(cursor.getMonth() + 1);
	return `${short ? name.slice(0, 3) : name} ${cursor.getFullYear()}`;
}

/**
 * "7 – 13 September 2026", collapsing what the two ends share:
 * "28 September – 4 October 2026" across a month, and
 * "28 December 2026 – 3 January 2027" across a new year.
 */
export function weekLabel(
	cursor: Date,
	startsOn: 0 | 1 = 1,
	short = false
): string {
	const start = weekStart(cursor, startsOn);
	const end = new Date(start);
	end.setDate(end.getDate() + 6);

	// A week spanning two long months is the longest label this bar can be
	// asked to hold — "28 September – 4 October 2026" — so it abbreviates
	// on the same terms the month does.
	const name = (d: Date) => {
		const full = monthName(d.getMonth() + 1);
		return short ? full.slice(0, 3) : full;
	};
	const sameYear = start.getFullYear() === end.getFullYear();
	const sameMonth = sameYear && start.getMonth() === end.getMonth();
	const from = sameMonth
		? String(start.getDate())
		: `${start.getDate()} ${name(start)}${
				sameYear ? "" : ` ${start.getFullYear()}`
		  }`;
	// En dash, spaced — the same range mark the plan pages use.
	return `${from} – ${end.getDate()} ${name(end)} ${end.getFullYear()}`;
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

/** A span's run of days within one week row. */
export interface SpanRun {
	/** Days of the span this row holds — the columns the bar covers. */
	length: number;
	/** More of the span follows on the next row. */
	continues: boolean;
	/** This day opens the run: the span's first day, or a week's. */
	opens: boolean;
}

/**
 * How much of a span belongs to the row a given day sits in.
 *
 * A bar is drawn once per row rather than once per day, so its title has
 * the whole run to be read across instead of truncating inside the first
 * square. The cell that opens the run draws it; the rest of the run's cells
 * hold an empty slot to keep the lanes below them in place.
 *
 * Null when the day isn't in the span at all.
 */
export function spanRun(
	days: readonly string[],
	day: string,
	weekStartsOn: 0 | 1 = 1
): SpanRun | null {
	const i = days.indexOf(day);
	if (i < 0) return null;
	const dow = (d: string) => new Date(d + "T00:00:00").getDay();
	const lastOfWeek = (weekStartsOn + 6) % 7;

	let length = 1;
	// The days are contiguous, so the run ends where the week does.
	while (i + length < days.length && dow(days[i + length - 1]) !== lastOfWeek) {
		length++;
	}
	return {
		length,
		continues: i + length < days.length,
		opens: i === 0 || dow(day) === weekStartsOn,
	};
}

/**
 * A lane per span, so a bar keeps the same line in every cell it crosses.
 *
 * Without this a plan takes whatever row is free in each day's cell and
 * staircases down the week as its neighbours come and go. Lanes run across
 * the whole grid rather than per week, so a trip doesn't jump lines at a
 * week boundary either.
 *
 * Lowest free lane, taken in date order: the earliest span gets the top
 * line, and a lane is reusable the moment its last day has passed.
 */
export function assignSpanLanes(
	spans: readonly { key: string; days: readonly string[] }[]
): Map<string, number> {
	const taken: Set<string>[] = [];
	const lanes = new Map<string, number>();
	const ordered = [...spans].sort(
		(a, b) =>
			(a.days[0] ?? "").localeCompare(b.days[0] ?? "") ||
			a.key.localeCompare(b.key)
	);
	for (const span of ordered) {
		let lane = 0;
		while (taken[lane] && span.days.some((d) => taken[lane].has(d))) lane++;
		if (!taken[lane]) taken[lane] = new Set();
		for (const d of span.days) taken[lane].add(d);
		lanes.set(span.key, lane);
	}
	return lanes;
}

/** "8pm", "7:30pm" — compact enough for a chip, where "7:30 PM" wraps. */
export function shortTime(time: string): string {
	const special = specialEventTime(time);
	if (special) return special.label;
	const [h, m] = time.split(":").map(Number);
	if (Number.isNaN(h)) return time;
	const period = h < 12 ? "am" : "pm";
	const hour = h % 12 || 12;
	return m ? `${hour}:${String(m).padStart(2, "0")}${period}` : `${hour}${period}`;
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
