import { createSuite } from "./harness.mjs";
import { eventPeriod, groupEventsByPeriod, weekStart } from "./.build/callander.mjs";

/** Sunday 6 September 2026 — deliberately the last day of its week, so the
 *  "This week" boundary is one day away in one direction and six in the
 *  other. A Wednesday would hide an off-by-one at either end. */
const NOW = new Date(2026, 8, 6);

const ev = (name, date) => ({ name, date });
const dateOf = (e) => e.date;
const named = (g) => (g?.items ?? []).map((i) => i.name);
const label = (date) => eventPeriod(date, NOW).label;
/** Wednesday 16 September 2026 — mid-month, so this week opened on the 14th
 *  and there are September days behind it. From NOW there are none: its week
 *  opened 31 August, so "Earlier this month" is unreachable there. */
const MID = new Date(2026, 8, 16);
const labelMid = (date) => eventPeriod(date, MID).label;
const iso = (d) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
		d.getDate()
	).padStart(2, "0")}`;

/**
 * Which heading an event lands under on the Events timeline.
 *
 * The near future is named by how soon it is; everything else by its month,
 * carrying a year once it leaves this one. Runs backwards too, because the
 * page has Past and All modes.
 */
export function run() {
	const { eq, result } = createSuite("event groups");

	// ---------- weekStart ----------
	eq("midweek walks back to Monday", iso(weekStart(new Date(2026, 8, 9))), "2026-09-07");
	eq("Monday is already the start", iso(weekStart(new Date(2026, 8, 7))), "2026-09-07");
	// The one a Sunday-start implementation gets wrong.
	eq("Sunday closes the week it started in", iso(weekStart(new Date(2026, 8, 6))), "2026-08-31");
	eq("a week can open in the previous month", iso(weekStart(new Date(2026, 9, 1))), "2026-09-28");
	eq("or the previous year", iso(weekStart(new Date(2027, 0, 1))), "2026-12-28");

	// ---------- the near future ----------
	// NOW is Sunday 6 Sept, so this week opened Monday 31 August.
	eq("today is this week", label("2026-09-06"), "This week");
	eq("so is the Monday it opened on", label("2026-08-31"), "This week");
	// This week reaches back into August, but a date outside it is judged
	// by its own month, not by the week that nearly caught it.
	eq("the day before it opened is August's", label("2026-08-30"), "August");
	eq("tomorrow starts next week", label("2026-09-07"), "Next week");
	eq("and next Sunday closes it", label("2026-09-13"), "Next week");
	// The gap the spec exists for: past next week, still this month.
	eq("the day after that is later this month", label("2026-09-14"), "Later this month");
	eq("as is the end of the month", label("2026-09-30"), "Later this month");

	// ---------- months ----------
	eq("the next month is named", label("2026-10-05"), "October");
	eq("and the one after", label("2026-11-20"), "November");
	// A bare month name would mean two different things in a list that runs
	// both ways, so the year appears the moment it leaves this one.
	eq("a month in another year carries it", label("2027-01-04"), "January 2027");
	eq("including the far end of the window", label("2027-09-01"), "September 2027");

	// ---------- backwards, for Past and All ----------
	// From NOW every September day is inside this week, so these use MID.
	eq("a day behind this week is earlier this month", labelMid("2026-09-01"), "Earlier this month");
	eq("right up to the day this week opened", labelMid("2026-09-13"), "Earlier this month");
	eq("which still leads with This week", labelMid("2026-09-16"), "This week");
	eq("and Later this month still follows", labelMid("2026-09-29"), "Later this month");
	eq("a past month in this year is bare", label("2026-06-14"), "June");
	eq("a past month in another year carries it", label("2025-08-14"), "August 2025");
	// The collision the year rule prevents: without it both of these read
	// "September" and would merge into one heading.
	eq(
		"two Septembers stay apart",
		[label("2025-09-15"), label("2027-09-15")],
		["September 2025", "September 2027"]
	);

	// ---------- alwaysYear, for the backwards-facing modes ----------
	// Past and All reach back years, where a bare "August" beside
	// "August 2025" reads as two different kinds of thing.
	const back = (date) => eventPeriod(date, NOW, { alwaysYear: true }).label;
	eq("this year's month gains its year", back("2026-06-14"), "June 2026");
	eq("two Augusts read alike", [back("2025-08-14"), back("2026-08-14")], [
		"August 2025",
		"August 2026",
	]);
	// Only the month headings change: the relative ones have no year to add.
	eq("This week is untouched", back("2026-09-06"), "This week");
	eq("so is Later this month", back("2026-09-30"), "Later this month");
	eq("and the undated group", back(""), "No exact date");
	// Off by default, which is what Upcoming keeps.
	eq("bare by default", label("2026-06-14"), "June");
	// The grouping call passes the option through rather than dropping it.
	eq(
		"groupEventsByPeriod honours it",
		groupEventsByPeriod([ev("A", "2026-06-14")], dateOf, NOW, {
			alwaysYear: true,
		})[0].label,
		"June 2026"
	);

	// ---------- anything not known to the day ----------
	eq("an undated event has no period", label(""), "No exact date");
	eq("nor does a month-only one", label("2026-10"), "No exact date");
	eq("nor a year-only one", label("2026"), "No exact date");

	// ---------- grouping and order ----------
	const groups = groupEventsByPeriod(
		[
			ev("Next month", "2026-10-05"),
			ev("Anytime", ""),
			ev("Tomorrow", "2026-09-07"),
			ev("Late Sept", "2026-09-20"),
			ev("Today", "2026-09-06"),
			ev("Last month", "2026-08-10"),
			ev("Next year", "2027-03-02"),
		],
		dateOf,
		NOW
	);
	eq(
		"headings run in time order, undated first",
		groups.map((g) => g.label),
		[
			"No exact date",
			"August",
			"This week",
			"Next week",
			"Later this month",
			"October",
			"March 2027",
		]
	);
	eq("events land under their own heading", named(groups[2]), ["Today"]);
	// Whatever order the page sorted them in survives inside a heading.
	eq(
		"order within a group is the caller's",
		named(
			groupEventsByPeriod(
				[ev("B", "2026-09-09"), ev("A", "2026-09-08")],
				dateOf,
				NOW
			)[0]
		),
		["B", "A"]
	);
	eq("only groups holding something are drawn", groups.length, 7);
	eq("nothing in, nothing out", groupEventsByPeriod([], dateOf, NOW), []);

	return result();
}
