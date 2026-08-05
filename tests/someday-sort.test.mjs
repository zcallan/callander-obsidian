import { createSuite } from "./harness.mjs";
import {
	sortSomedays,
	possibleToday,
	daysUntil,
	fromDateLabel,
	untilDateLabel,
	dateDeadlineLabel,
	seasonOfDate,
} from "./.build/callander.mjs";

/**
 * The Somedays orderings — chiefly "Recommended", which blends many
 * factors and is the one place in this plugin where getting the order
 * subtly wrong would be invisible rather than broken. Every case here
 * pins a fixed `now`, so none of it drifts with the real calendar.
 */

/** A someday with everything neutral; override just what a case is about. */
function someday(name, over = {}) {
	return {
		file: { path: `Somedays/${name}.md`, stat: { ctime: 0 } },
		name,
		date: "",
		seasons: [],
		days: [],
		fromDate: "",
		untilDate: "",
		cost: null,
		types: [],
		people: [],
		status: "open",
		convertedTo: "",
		...over,
	};
}

const order = (list, sort, opts) =>
	sortSomedays(list, sort, opts).map((s) => s.name);

export function run() {
	const { eq, ok, result } = createSuite("someday sort");

	// A Wednesday, deliberately mid-month and mid-year.
	const now = new Date(2026, 6, 15); // 15 July 2026
	const withNow = { now };

	// ---------- helpers ----------
	eq("days until a future date", daysUntil("2026-07-25", now), 10);
	eq("days until today's date", daysUntil("2026-07-15", now), 0);
	eq("a passed date counts negative", daysUntil("2026-07-01", now), -14);
	eq("a blank date has no count", daysUntil("", now), null);
	eq(
		"a month-precision date is too coarse to count",
		daysUntil("2026-07", now),
		null
	);

	// ---------- untilDateLabel ----------
	eq("no until date, no label", untilDateLabel("", now), "");
	eq(
		"day precision leads with 'before', day-first",
		untilDateLabel("2026-09-12", now),
		"before 12 Sep"
	);
	eq(
		"day precision in a future year shows it",
		untilDateLabel("2027-09-12", now),
		"before 12 Sep 2027"
	);
	eq(
		"day precision in the current year hides it",
		untilDateLabel("2026-09-12", now).includes("2026"),
		false
	);
	eq(
		"month precision reads 'by end of', full name",
		untilDateLabel("2026-08", now),
		"by end of August"
	);
	eq(
		"month precision in a future year shows it",
		untilDateLabel("2027-08", now),
		"by end of August 2027"
	);
	eq(
		"year precision is just the year",
		untilDateLabel("2026", now),
		"by end of 2026"
	);
	eq(
		"a future bare year still just states the year — no 'end of 2027 2027'",
		untilDateLabel("2027", now),
		"by end of 2027"
	);

	// ---------- fromDateLabel ----------
	eq("no from date, no label", fromDateLabel("", now), "");
	eq(
		"a future start reads 'from', day-first",
		fromDateLabel("2026-09-12", now),
		"from 12 Sep"
	);
	eq(
		"a future start next year shows the year",
		fromDateLabel("2027-02-01", now),
		"from 1 Feb 2027"
	);
	eq(
		"a start that has arrived says nothing",
		fromDateLabel("2026-07-15", now),
		""
	);
	eq(
		"a passed start says nothing either",
		fromDateLabel("2026-07-01", now),
		""
	);
	eq(
		"a future month-precision start reads 'from Sep'",
		fromDateLabel("2026-09", now),
		"from Sep"
	);
	eq(
		"a future bare year reads 'from 2027'",
		fromDateLabel("2027", now),
		"from 2027"
	);
	eq(
		"the current bare year has already arrived",
		fromDateLabel("2026", now),
		""
	);

	// ---------- dateDeadlineLabel ----------
	eq("no date, no label", dateDeadlineLabel("", now), "");
	eq(
		"day precision stays out — it rides with the day-of-week summary",
		dateDeadlineLabel("2026-09-12", now),
		""
	);
	eq(
		"month precision reads 'by end of', abbreviated",
		dateDeadlineLabel("2026-09", now),
		"by end of Sep"
	);
	eq(
		"month precision in a future year shows it",
		dateDeadlineLabel("2027-09", now),
		"by end of Sep 2027"
	);
	eq(
		"month precision in the current year hides it",
		dateDeadlineLabel("2026-09", now).includes("2026"),
		false
	);
	eq(
		"year precision is just the year",
		dateDeadlineLabel("2026", now),
		"by end of 2026"
	);
	eq(
		"a future bare year still just states the year",
		dateDeadlineLabel("2027", now),
		"by end of 2027"
	);

	eq("July is summer up north", seasonOfDate(new Date(2026, 6, 15)), "summer");
	eq("January is winter up north", seasonOfDate(new Date(2026, 0, 15)), "winter");

	// ---------- hemisphere ----------
	// Every month must be the seasonal opposite down south — checked across
	// the whole year, since the month arithmetic wraps at the boundaries and
	// an off-by-one there would only show up in one or two months.
	const OPPOSITE = {
		winter: "summer",
		summer: "winter",
		spring: "fall",
		fall: "spring",
	};
	let flipped = 0;
	for (let m = 0; m < 12; m++) {
		const north = seasonOfDate(new Date(2026, m, 15), "northern");
		const south = seasonOfDate(new Date(2026, m, 15), "southern");
		if (south === OPPOSITE[north]) flipped++;
	}
	eq("all 12 months invert in the southern hemisphere", flipped, 12);
	eq(
		"December is summer down south",
		seasonOfDate(new Date(2026, 11, 15), "southern"),
		"summer"
	);
	eq(
		"July is winter down south",
		seasonOfDate(new Date(2026, 6, 15), "southern"),
		"winter"
	);
	eq(
		"the hemisphere defaults to northern",
		seasonOfDate(new Date(2026, 6, 15)),
		seasonOfDate(new Date(2026, 6, 15), "northern")
	);

	{
		// The setting has to actually reach the ranking, not just the helper.
		const summerThing = someday("summer thing", { seasons: ["summer"] });
		ok(
			"a summer someday is possible in July up north",
			possibleToday(summerThing, now, "northern")
		);
		ok(
			"...but not in July down south",
			!possibleToday(summerThing, now, "southern")
		);
		// Named so alphabetical order favours the seasonal one: up north it
		// keeps that lead (both are possible today, so nothing separates
		// them), and down south it must lose it despite the name.
		const list = [
			someday("aaa summer", { seasons: ["summer"] }),
			someday("zzz plain"),
		];
		eq(
			"up north a summer someday holds its place in July",
			order(list, "recommended", { now, hemisphere: "northern" }),
			["aaa summer", "zzz plain"]
		);
		eq(
			"down south it sinks below what's actually possible today",
			order(list, "recommended", { now, hemisphere: "southern" }),
			["zzz plain", "aaa summer"]
		);
	}

	// ---------- possibleToday ----------
	ok("no constraints at all is always possible", possibleToday(someday("a"), now));
	ok(
		"a matching weekday is possible",
		possibleToday(someday("a", { days: ["wed"] }), now)
	);
	ok(
		"a non-matching weekday is not",
		!possibleToday(someday("a", { days: ["sat", "sun"] }), now)
	);
	ok(
		"an exact date matching today is possible",
		possibleToday(someday("a", { date: "2026-07-15" }), now)
	);
	ok(
		"an exact date on another day is not",
		!possibleToday(someday("a", { date: "2026-07-16" }), now)
	);
	ok(
		"a month-precision date covering today is possible",
		possibleToday(someday("a", { date: "2026-07" }), now)
	);
	ok(
		"a matching season is possible",
		possibleToday(someday("a", { seasons: ["summer"] }), now)
	);
	ok(
		"a non-matching season is not",
		!possibleToday(someday("a", { seasons: ["winter"] }), now)
	);
	ok(
		"weekday and date must BOTH allow it",
		!possibleToday(
			someday("a", { days: ["sat"], date: "2026-07-15" }),
			now
		)
	);
	ok(
		"time of day is ignored — it never blocks 'possible today'",
		possibleToday(someday("a", { times: ["night"] }), now)
	);
	ok(
		"a window that hasn't opened is not possible",
		!possibleToday(someday("a", { fromDate: "2026-07-20" }), now)
	);
	ok(
		"an open window is possible",
		possibleToday(
			someday("a", { fromDate: "2026-07-10", untilDate: "2026-07-20" }),
			now
		)
	);
	ok(
		"a window opening today is possible",
		possibleToday(someday("a", { fromDate: "2026-07-15" }), now)
	);
	ok(
		"a window that has closed is not",
		!possibleToday(someday("a", { untilDate: "2026-07-01" }), now)
	);
	ok(
		"a window closing today still is",
		possibleToday(someday("a", { untilDate: "2026-07-15" }), now)
	);

	// ---------- recommended: factor priority ----------
	{
		// Factor 1 (urgent deadline) outranks factor 2 (possible today).
		const list = [
			someday("possible", { days: ["wed"] }),
			someday("urgent", { untilDate: "2026-07-20", days: ["sat"] }),
		];
		eq("an urgent deadline leads", order(list, "recommended", withNow), [
			"urgent",
			"possible",
		]);
	}
	{
		// Within the urgent tier, the nearest deadline leads.
		const list = [
			someday("far", { untilDate: "2026-08-10" }),
			someday("near", { untilDate: "2026-07-17" }),
		];
		eq("soonest deadline first", order(list, "recommended", withNow), [
			"near",
			"far",
		]);
	}
	{
		// Just outside the 30-day window isn't urgent.
		const list = [
			someday("beyond", { untilDate: "2026-08-20" }),
			someday("inside", { untilDate: "2026-08-13" }),
		];
		eq(
			"30 days is the cutoff",
			order(list, "recommended", withNow),
			["inside", "beyond"]
		);
	}
	{
		// A passed deadline is dead, not urgent — it gets no boost. Named so
		// that alphabetical order would put the expired one first, proving
		// it's the urgency rule deciding this and not the name tiebreak.
		const list = [
			someday("aaa expired", { untilDate: "2026-07-01" }),
			someday("zzz urgent", { untilDate: "2026-07-20" }),
		];
		eq(
			"a passed deadline loses to a live one",
			order(list, "recommended", withNow),
			["zzz urgent", "aaa expired"]
		);
	}
	{
		// ...and it doesn't outrank something actually doable today.
		const list = [
			someday("aaa expired", {
				untilDate: "2026-07-01",
				days: ["sat"],
			}),
			someday("zzz today", { days: ["wed"] }),
		];
		eq(
			"a passed deadline loses to something possible today",
			order(list, "recommended", withNow),
			["zzz today", "aaa expired"]
		);
	}
	{
		// A window that hasn't opened can't be planned yet, so it sinks
		// below everything live — even below a row that merely isn't
		// possible today, and even though its own deadline is urgent.
		const list = [
			someday("aaa opens next month", {
				fromDate: "2026-08-01",
				untilDate: "2026-08-05",
			}),
			someday("zzz saturday only", { days: ["sat"] }),
		];
		eq(
			"a not-yet-open window sinks below live somedays",
			order(list, "recommended", withNow),
			["zzz saturday only", "aaa opens next month"]
		);
	}
	{
		// Within the deferred group, the next window to open leads.
		const list = [
			someday("december", { fromDate: "2026-12-01" }),
			someday("august", { fromDate: "2026-08-01" }),
		];
		eq(
			"the next window to open leads the deferred group",
			order(list, "recommended", withNow),
			["august", "december"]
		);
	}
	{
		// A window already open is live, not deferred — it competes on the
		// ordinary factors and its deadline still counts as urgent.
		const list = [
			someday("zzz open window", {
				fromDate: "2026-07-10",
				untilDate: "2026-07-25",
			}),
			someday("aaa plain"),
		];
		eq(
			"an open window rides its urgent deadline to the top",
			order(list, "recommended", withNow),
			["zzz open window", "aaa plain"]
		);
	}
	{
		const list = [
			someday("saturday", { days: ["sat"] }),
			someday("today", { days: ["wed"] }),
		];
		eq(
			"possible today beats not-today",
			order(list, "recommended", withNow),
			["today", "saturday"]
		);
	}
	{
		const list = [
			someday("trip", { types: ["longTrip"] }),
			someday("plain"),
			someday("meal", { types: ["food"] }),
		];
		eq(
			"food leads, trips sink",
			order(list, "recommended", withNow),
			["meal", "plain", "trip"]
		);
	}
	{
		// Short trips are weekend-sized — they don't get the long-trip sink.
		const list = [
			someday("aaa short trip", { types: ["shortTrip"] }),
			someday("zzz plain"),
		];
		eq(
			"a short trip holds its place",
			order(list, "recommended", withNow),
			["aaa short trip", "zzz plain"]
		);
	}
	{
		const list = [
			someday("alone"),
			someday("withFriends", { people: ["[[Riley]]"] }),
		];
		eq(
			"having suggested people wins the tie",
			order(list, "recommended", withNow),
			["withFriends", "alone"]
		);
	}
	{
		const list = [
			someday("pricey", { cost: 90 }),
			someday("cheap", { cost: 10 }),
			someday("unpriced"),
		];
		eq(
			"cheapest first; an unrecorded cost sorts last, not as free",
			order(list, "recommended", withNow),
			["cheap", "pricey", "unpriced"]
		);
	}
	{
		// Cost only breaks the tie once every boolean factor matches.
		const list = [
			someday("cheapTrip", { types: ["longTrip"], cost: 5 }),
			someday("dearMeal", { types: ["food"], cost: 500 }),
		];
		eq(
			"a cheap trip still loses to a dear meal — type outranks cost",
			order(list, "recommended", withNow),
			["dearMeal", "cheapTrip"]
		);
	}

	// ---------- done / converted sink under every sort ----------
	for (const sort of [
		"recommended",
		"newest",
		"oldest",
		"nameAsc",
		"nameDesc",
		"type",
	]) {
		const list = [
			someday("finished", { status: "done" }),
			someday("became a plan", { convertedTo: "Plans/Trip.md" }),
			someday("live"),
		];
		const got = order(list, sort, withNow);
		eq(`${sort}: an open someday leads the spent ones`, got[0], "live");
	}

	// ---------- the plain sorts ----------
	{
		const list = [
			someday("older", { file: { path: "a.md", stat: { ctime: 100 } } }),
			someday("newer", { file: { path: "b.md", stat: { ctime: 900 } } }),
		];
		eq("newest first", order(list, "newest", withNow), ["newer", "older"]);
		eq("oldest first", order(list, "oldest", withNow), ["older", "newer"]);
	}
	{
		const list = [someday("Beta"), someday("alpha"), someday("Gamma")];
		eq("A-Z is case-insensitive", order(list, "nameAsc", withNow), [
			"alpha",
			"Beta",
			"Gamma",
		]);
		eq("Z-A reverses it", order(list, "nameDesc", withNow), [
			"Gamma",
			"Beta",
			"alpha",
		]);
	}
	{
		// A name can carry its own emoji, which the row renders in place of
		// the type's. Comparing that character would float every such
		// someday above the letters — "⚾ Red Sox" ahead of "Aquarium".
		const list = [
			someday("⚾ Red Sox"),
			someday("Aquarium"),
			someday("Zoo"),
		];
		eq(
			"a leading emoji doesn't hijack A-Z",
			order(list, "nameAsc", withNow),
			["Aquarium", "⚾ Red Sox", "Zoo"]
		);
		eq(
			"...nor Z-A",
			order(list, "nameDesc", withNow),
			["Zoo", "⚾ Red Sox", "Aquarium"]
		);
	}
	{
		// Emoji shapes the naive regex would miss: a flag (regional
		// indicators aren't pictographic), a keycap, and a ZWJ sequence.
		const list = [
			someday("🇯🇵 Tokyo"),
			someday("👨‍👩‍👧 Family day"),
			someday("1️⃣ First thing"),
			someday("Basics"),
		];
		eq(
			"flags, keycaps and ZWJ sequences are stripped too",
			order(list, "nameAsc", withNow),
			["Basics", "👨‍👩‍👧 Family day", "1️⃣ First thing", "🇯🇵 Tokyo"]
		);
	}
	{
		// An emoji-only name has nothing left after stripping — it must
		// still sort somewhere stable rather than collapsing to "".
		const list = [someday("🎈"), someday("Balloon")];
		eq(
			"an emoji-only name still sorts",
			order(list, "nameAsc", withNow).length,
			2
		);
	}

	// ---------- type ----------
	{
		// Alphabetical by the label you see, not the id — "Long Trip" reads
		// as L, and would land under "l" if ids were compared naively.
		const list = [
			someday("n", { types: ["nature"] }),
			someday("a", { types: ["activity"] }),
			someday("l", { types: ["longTrip"] }),
			someday("f", { types: ["food"] }),
		];
		eq("types sort alphabetically", order(list, "type", withNow), [
			"a",
			"f",
			"l",
			"n",
		]);
	}
	{
		const list = [
			someday("other", { types: ["other"] }),
			someday("shopping", { types: ["shopping"] }),
			someday("activity", { types: ["activity"] }),
		];
		eq(
			"Other is pinned last however it falls alphabetically",
			order(list, "type", withNow),
			["activity", "shopping", "other"]
		);
	}
	{
		// Named so alphabetical order would put the untyped one first —
		// otherwise "Other before untyped" and "both equally last" produce
		// the same answer and the test proves nothing.
		const list = [
			someday("aaa untyped"),
			someday("zzz other", { types: ["other"] }),
			someday("food", { types: ["food"] }),
		];
		eq(
			"an untyped someday sits below even Other",
			order(list, "type", withNow),
			["food", "zzz other", "aaa untyped"]
		);
	}
	{
		const list = [
			someday("⚾ Red Sox", { types: ["game"] }),
			someday("Aquarium", { types: ["game"] }),
			someday("Bakery", { types: ["food"] }),
		];
		eq(
			"within a type, names order — emoji stripped, as everywhere else",
			order(list, "type", withNow),
			["Bakery", "Aquarium", "⚾ Red Sox"]
		);
	}
	{
		// An id no longer in SOMEDAY_TYPES (a someday saved before the types
		// were regrouped, if its migration hasn't run) must not vanish or
		// throw — it sorts as untyped.
		const list = [someday("stale", { types: ["park"] }), someday("live", { types: ["food"] })];
		eq(
			"an unknown type sorts as untyped rather than breaking",
			order(list, "type", withNow),
			["live", "stale"]
		);
	}
	{
		// Multi-type: every applicable Recommended slot counts — carrying
		// a long-trip type sinks it even when a food type also applies.
		const list = [
			someday("roadtrip lunch", { types: ["longTrip", "food"] }),
			someday("plain"),
			someday("meal", { types: ["food"] }),
		];
		eq(
			"a food-trip still sinks like a trip",
			order(list, "recommended", withNow),
			["meal", "plain", "roadtrip lunch"]
		);
	}
	{
		// ...while the Type sort ranks by the lead (first natural) type.
		const list = [
			someday("n", { types: ["nature"] }),
			someday("multi", { types: ["activity", "nature"] }),
		];
		eq(
			"multi-type sorts by its lead type",
			order(list, "type", withNow),
			["multi", "n"]
		);
	}

	// ---------- random ----------
	{
		const list = ["a", "b", "c", "d", "e", "f", "g", "h"].map((n) =>
			someday(n)
		);
		const first = order(list, "random", { now, randomSeed: 1 });
		const same = order(list, "random", { now, randomSeed: 1 });
		const other = order(list, "random", { now, randomSeed: 2 });
		eq("the same seed gives the same order", first, same);
		ok("a different seed reshuffles", JSON.stringify(first) !== JSON.stringify(other));
		eq("nothing is lost in the shuffle", [...first].sort().join(), "a,b,c,d,e,f,g,h");
	}

	// ---------- the input is never mutated ----------
	{
		const list = [someday("b"), someday("a")];
		sortSomedays(list, "nameAsc", withNow);
		eq(
			"sorting returns a new array and leaves the caller's alone",
			list.map((s) => s.name),
			["b", "a"]
		);
	}

	return result();
}
