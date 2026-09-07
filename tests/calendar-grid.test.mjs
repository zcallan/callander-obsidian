import { createSuite } from "./harness.mjs";
import {
	eventsByDay,
	monthGrid,
	monthLabel,
	weekGrid,
	weekLabel,
} from "./.build/callander.mjs";

/** Monday 7 September 2026. */
const NOW = new Date(2026, 8, 7);

const ev = (name, date, time = "") => ({ name, date, time });
const dateOf = (e) => e.date;
const timeOf = (e) => e.time;
const named = (list) => (list ?? []).map((e) => e.name);

/**
 * The shape of the calendar grid: which days a month draws, where the week
 * starts, and which events land in which cell.
 */
export function run() {
	const { eq, result } = createSuite("calendar grid");

	// ---------- monthGrid ----------
	const sept = monthGrid(new Date(2026, 8, 1), NOW);
	// September 2026 opens on a Tuesday and closes on a Wednesday, so the
	// grid borrows Monday 31 August and runs to Sunday 4 October.
	eq("a month grid is whole weeks", sept.length % 7, 0);
	eq("it opens on the Monday before the 1st", sept[0]?.date, "2026-08-31");
	eq("and closes on a Sunday", sept.at(-1)?.date, "2026-10-04");
	eq("borrowed days are marked", [sept[0].inMonth, sept[1].inMonth], [false, true]);
	eq("as are the trailing ones", sept.at(-1)?.inMonth, false);
	eq("today is flagged once", sept.filter((d) => d.isToday).length, 1);
	eq(
		"and it's the right day",
		sept.find((d) => d.isToday)?.date,
		"2026-09-07"
	);

	// Row count varies rather than being pinned at six, so most months don't
	// carry a wholly empty trailing row.
	eq("September 2026 needs five rows", sept.length / 7, 5);
	// August 2026 opens on a Saturday and has 31 days — the six-row case.
	eq("August 2026 needs six", monthGrid(new Date(2026, 7, 1), NOW).length / 7, 6);
	// February 2027 is 28 days opening on a Monday — the four-row case, and
	// the one a hard-coded six would waste two rows on.
	eq("February 2027 needs four", monthGrid(new Date(2027, 1, 1), NOW).length / 7, 4);

	eq("every day carries its own number", sept[1]?.day, 1);
	eq("...including a borrowed one", sept[0]?.day, 31);

	// ---------- weekGrid ----------
	const wk = weekGrid(new Date(2026, 8, 9), NOW);
	eq("a week is seven days", wk.length, 7);
	eq("opening on Monday", wk[0]?.date, "2026-09-07");
	eq("and closing on Sunday", wk[6]?.date, "2026-09-13");
	// The one a Sunday-start implementation gets wrong.
	eq(
		"a Sunday belongs to the week that opened six days earlier",
		weekGrid(new Date(2026, 8, 13), NOW)[0]?.date,
		"2026-09-07"
	);
	eq("nothing in a week is borrowed", wk.every((d) => d.inMonth), true);

	// ---------- labels ----------
	eq("months carry the year", monthLabel(new Date(2026, 8, 1)), "September 2026");
	eq("a week inside one month names it once", weekLabel(new Date(2026, 8, 9)), "7 – 13 September 2026");
	eq(
		"a week across two months names both",
		weekLabel(new Date(2026, 8, 30)),
		"28 September – 4 October 2026"
	);
	// Both years, or the range is a riddle.
	eq(
		"a week across new year names both years",
		weekLabel(new Date(2026, 11, 30)),
		"28 December 2026 – 3 January 2027"
	);

	// ---------- eventsByDay ----------
	const byDay = eventsByDay(
		[
			ev("Gig", "2026-09-11", "20:00"),
			ev("Hike", "2026-09-09", "08:00"),
			ev("Dentist", "2026-09-09", "18:00"),
			ev("Coffee", "2026-09-09"),
			ev("Anytime", "2026-09-12"),
		],
		dateOf,
		timeOf
	);
	eq("events land on their own day", named(byDay.get("2026-09-11")), ["Gig"]);
	// Untimed leads, the way an all-day event does in every calendar — and
	// "Anytime" here means exactly that.
	eq("untimed leads, then the clock", named(byDay.get("2026-09-09")), [
		"Coffee",
		"Hike",
		"Dentist",
	]);
	eq("a day with nothing has no entry", byDay.get("2026-09-10"), undefined);

	// A cell is a day. Anything coarser has no cell to sit in, and putting
	// it on the 1st would be inventing a day the note doesn't claim.
	const coarse = eventsByDay(
		[
			ev("Dated", "2026-09-09"),
			ev("Month only", "2026-09"),
			ev("Year only", "2026"),
			ev("Undated", ""),
		],
		dateOf,
		timeOf
	);
	eq("only day-precise events are placed", [...coarse.keys()], ["2026-09-09"]);
	eq("and the rest are dropped rather than guessed", coarse.size, 1);

	eq("nothing in, nothing out", eventsByDay([], dateOf, timeOf).size, 0);

	return result();
}
