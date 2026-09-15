import { createSuite } from "./harness.mjs";
import {
	planDays,
	planHiddenFrom,
	planRowFields,
	planSpanLabel,
	planWhenDate,
	plansForEventsPage,
} from "./.build/callander.mjs";

const plan = (over = {}) => ({
	name: "Weekend in Maine",
	date: "2026-08-15",
	endDate: "",
	location: "Portland",
	...over,
});

/**
 * How a plan reads as a row, which days it covers, and which lists it has
 * been taken off — the rules the dashboard's Plans section and the Events
 * page both read a trip through.
 */
export function run() {
	const { eq, result } = createSuite("plan row");

	// Saturday 15 August 2026.
	const now = new Date(2026, 7, 15, 10, 0, 0);

	// ---------- how a plan reads ----------
	{
		const fields = planRowFields(plan({ date: "2026-09-19" }), now);
		eq("a plain plan takes the map icon", fields.icon, "🗺️");
		// With nobody named, where it is beats saying nothing at all.
		eq("and shows where it is", fields.suffix, "Portland");
		eq("people win over the location", planRowFields(plan({ date: "2026-09-19" }), now, "Austin, Riley").suffix, "Austin, Riley");
		// A plan has no time of day to run at.
		eq("a plan has no time", fields.time, "");
	}
	{
		// The name's own emoji is the one that means something.
		const fields = planRowFields(plan({ name: "🏔️ Maine" }), now);
		eq("its own emoji stands in", fields.icon, "🏔️");
		eq("and comes off the name", fields.name, "Maine");
	}
	eq(
		"an undated plan says so rather than going blank",
		planRowFields(plan({ date: "" }), now).date,
		"No date yet"
	);
	{
		// A range reads as one: "16 Aug - 17 Aug", not two dates to compare.
		const fields = planRowFields(
			plan({ date: "2026-08-16", endDate: "2026-08-17" }),
			now
		);
		eq("a span reads as a range", fields.date.includes(" - 17 Aug"), true);
	}
	{
		// Underway: the start's "2 days ago" would read as though it were over.
		const fields = planRowFields(
			plan({ date: "2026-08-13", endDate: "2026-08-17" }),
			now
		);
		eq("a trip you're on reads as today", fields.relative, "today");
		eq("and is marked as the near thing it is", fields.tone, "soon");
	}
	{
		// Over: the end is the date that matters. A 4-day trip that finished
		// yesterday reads "yesterday", not "5 days ago" from its start.
		const fields = planRowFields(
			plan({ date: "2026-08-10", endDate: "2026-08-14" }),
			now
		);
		eq("a finished trip counts from its end", fields.relative, "yesterday");
	}
	{
		// A month-precision end can't say whether the span has finished, so
		// the start keeps both jobs.
		const fields = planRowFields(
			plan({ date: "2026-08-10", endDate: "2026-09" }),
			now
		);
		eq("a vague end leaves the start speaking", fields.relative, "5 days ago");
	}

	// ---------- the days it covers ----------
	eq("one day is one square", planDays(plan()), ["2026-08-15"]);
	eq(
		"a weekend away is the whole weekend",
		planDays(plan({ date: "2026-08-15", endDate: "2026-08-17" })),
		["2026-08-15", "2026-08-16", "2026-08-17"]
	);
	// No square to sit in — the list and timeline still say "No exact date".
	eq("a month-only plan has no day", planDays(plan({ date: "2026-08" })), []);
	eq("nor has an undated one", planDays(plan({ date: "" })), []);
	eq(
		"a vague end leaves just the start",
		planDays(plan({ date: "2026-08-15", endDate: "2026-09" })),
		["2026-08-15"]
	);
	eq(
		"an end before the start is ignored",
		planDays(plan({ date: "2026-08-15", endDate: "2026-08-10" })),
		["2026-08-15"]
	);
	{
		// 30 Dec to 2 Jan: an end with no year of its own has crossed over.
		const days = planDays({ date: "2026-12-30", endDate: "01-02" });
		eq("a New Year span crosses the year", days, [
			"2026-12-30",
			"2026-12-31",
			"2027-01-01",
			"2027-01-02",
		]);
	}
	{
		// A mistyped end date shouldn't paint a plan over a whole season.
		const days = planDays({ date: "2026-01-01", endDate: "2026-12-31" });
		eq("a runaway span is capped", days.length, 62);
		eq("from the start it was given", days[0], "2026-01-01");
	}

	// ---------- what a bar says about itself ----------
	// Weekday and day of the month: the grid says which month already, and
	// the bar has one line to spend.
	eq(
		"a span reads end to end",
		planSpanLabel(["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03"]),
		"Mon 31 - Thu 3"
	);
	eq("a single day is just itself", planSpanLabel(["2026-08-15"]), "Sat 15");
	eq("no days, nothing to say", planSpanLabel([]), "");
	// The same forms the grid's column headings use.
	eq(
		"weekdays read as the grid names them",
		[
			"2026-09-13",
			"2026-09-14",
			"2026-09-15",
			"2026-09-16",
			"2026-09-17",
			"2026-09-18",
			"2026-09-19",
		].map((d) => planSpanLabel([d]).split(" ")[0]),
		["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
	);
	// No ordinal: "20th" beside "27th" is two more syllables saying nothing
	// the bare number doesn't.
	eq(
		"days are bare numbers",
		planSpanLabel(["2026-09-01", "2026-09-02"]),
		"Tue 1 - Wed 2"
	);

	// ---------- which half of the page it falls in ----------
	// A trip you're on is still ahead of you: Upcoming keeps it until the
	// last day, and Past only takes it once it's over.
	eq(
		"the last day is what Upcoming and Past read",
		planWhenDate(plan({ date: "2026-08-13", endDate: "2026-08-17" })),
		"2026-08-17"
	);
	eq(
		"without a span, the date it has",
		planWhenDate(plan({ date: "2026-08" })),
		"2026-08"
	);

	// ---------- hidden by hand ----------
	eq(
		"a plan hidden from the Events page is left off it",
		plansForEventsPage([
			{ name: "Shown", hiddenFromEvents: false },
			{ name: "Hidden", hiddenFromEvents: true },
		]).map((p) => p.name),
		["Shown"]
	);
	// Hidden from Upcoming is a different question and doesn't touch this.
	eq(
		"but one hidden from Upcoming still shows",
		plansForEventsPage([
			{ name: "Elsewhere", hiddenFromEvents: false, hiddenFromUpcoming: true },
		]).map((p) => p.name),
		["Elsewhere"]
	);

	eq(
		"a plan on both lists offers no way back",
		planHiddenFrom({ hiddenFromUpcoming: false, hiddenFromEvents: false }),
		null
	);
	eq(
		"hidden from one names that one",
		planHiddenFrom({ hiddenFromUpcoming: true, hiddenFromEvents: false })?.label,
		"Show in Upcoming"
	);
	eq(
		"and the other names the other",
		planHiddenFrom({ hiddenFromUpcoming: false, hiddenFromEvents: true })?.label,
		"Show in Events"
	);
	{
		// One button, because the row has room for one — the aria label is
		// where both lists get named.
		const both = planHiddenFrom({
			hiddenFromUpcoming: true,
			hiddenFromEvents: true,
		});
		eq("hidden from both is one button", both?.label, "Show again");
		eq("that says which lists", both?.where, "Upcoming and Events");
		eq("and puts it back on both", both?.lists, ["upcoming", "events"]);
	}

	return result();
}
