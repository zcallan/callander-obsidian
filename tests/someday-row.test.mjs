import { createSuite } from "./harness.mjs";
import { somedayRowParts } from "./.build/callander.mjs";

/**
 * The parts a someday row is built from. Shared by the Somedays page and
 * the dashboard's shortlist, so a mistake here shows up in two places at
 * once — and, being only wording, would read as merely odd rather than
 * broken.
 */

/** A someday with everything unset; override just what a case is about. */
function someday(over = {}) {
	return {
		name: "Aquarium",
		date: "",
		seasons: [],
		days: [],
		fromDate: "",
		untilDate: "",
		types: [],
		...over,
	};
}

export function run() {
	const { eq, result } = createSuite("someday row");

	const now = new Date(2026, 7, 5); // 5 August 2026
	const parts = (over) => somedayRowParts(someday(over), now);

	// ---------- the title ----------
	eq("a plain name stands alone", parts({}).title, "Aquarium");
	eq(
		"the lead type's emoji fronts the name",
		parts({ types: ["food"] }).title,
		"🍽️ Aquarium"
	);
	eq(
		"a name with its own emoji keeps it, unduplicated",
		parts({ name: "⚾ Red Sox", types: ["food"] }).title,
		"⚾ Red Sox"
	);
	eq(
		"only the lead type shows",
		parts({ types: ["food", "drinks"] }).title,
		"🍽️ Aquarium"
	);
	eq(
		"an unknown type is ignored rather than breaking",
		parts({ types: ["park"] }).title,
		"Aquarium"
	);

	// ---------- the timing summary ----------
	eq("nothing set says nothing — never 'Any time'", parts({}).when, "");
	eq("days alone", parts({ days: ["sat", "sun"] }).when, "Weekends");
	eq(
		"an exact date joins the days",
		parts({ days: ["sat", "sun"], date: "2026-09-12" }).when,
		"Weekends · September 12, 2026"
	);
	eq(
		"an exact date alone",
		parts({ date: "2026-09-12" }).when,
		"September 12, 2026"
	);
	// A coarse date reads as a deadline beside the name instead, so it must
	// not also appear in the timing column.
	eq(
		"a month-precision date stays out of the timing column",
		parts({ days: ["sat", "sun"], date: "2026-09" }).when,
		"Weekends"
	);
	eq(
		"a year-precision date likewise",
		parts({ date: "2026" }).when,
		""
	);
	eq(
		"seasons never appear here",
		parts({ seasons: ["summer"] }).when,
		""
	);

	// ---------- the deadlines beside the name ----------
	eq("no window, no deadline", parts({}).deadlines, []);
	eq(
		"a coarse date becomes a deadline",
		parts({ date: "2026-09" }).deadlines,
		["by end of Sep"]
	);
	eq(
		"a season window becomes a deadline",
		parts({ seasons: ["summer", "fall"] }).deadlines,
		["by end of Fall"]
	);
	eq(
		"an until date reads as a deadline",
		parts({ untilDate: "2026-09-12" }).deadlines,
		["before 12 Sep"]
	);
	eq(
		"a future from-date reads as not-open-yet",
		parts({ fromDate: "2026-09-12" }).deadlines,
		["from 12 Sep"]
	);
	eq(
		"a from-date already passed constrains nothing",
		parts({ fromDate: "2026-07-01" }).deadlines,
		[]
	);
	// The not-yet-open phrase leads: it explains why the row sits low
	// under Recommended, which the closing date alone wouldn't.
	eq(
		"an open-then-close window reads in order",
		parts({ fromDate: "2026-09-12", untilDate: "2026-10-20" }).deadlines,
		["from 12 Sep", "before 20 Oct"]
	);
	eq(
		"an exact date is a day, not a deadline",
		parts({ date: "2026-09-12" }).deadlines,
		[]
	);

	return result();
}
