import { createSuite } from "./harness.mjs";
import {
	sortSomedays,
	possibleToday,
	daysUntilFinalDate,
	finalDateLabel,
	dateDeadlineLabel,
	seasonOfDate,
} from "./.build/callander.mjs";

/**
 * The Somedays orderings — chiefly "Recommended", which blends six
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
		finalDate: "",
		cost: null,
		type: "",
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
	eq("days until a future final date", daysUntilFinalDate("2026-07-25", now), 10);
	eq("days until today's final date", daysUntilFinalDate("2026-07-15", now), 0);
	eq("a passed final date counts negative", daysUntilFinalDate("2026-07-01", now), -14);
	eq("a blank final date has no count", daysUntilFinalDate("", now), null);
	eq(
		"a month-precision final date is too coarse to count",
		daysUntilFinalDate("2026-07", now),
		null
	);

	// ---------- finalDateLabel ----------
	eq("no final date, no label", finalDateLabel("", now), "");
	eq(
		"day precision leads with 'before', day-first",
		finalDateLabel("2026-09-12", now),
		"before 12 Sep"
	);
	eq(
		"day precision in a future year shows it",
		finalDateLabel("2027-09-12", now),
		"before 12 Sep 2027"
	);
	eq(
		"day precision in the current year hides it",
		finalDateLabel("2026-09-12", now).includes("2026"),
		false
	);
	eq(
		"month precision reads 'by end of', full name",
		finalDateLabel("2026-08", now),
		"by end of August"
	);
	eq(
		"month precision in a future year shows it",
		finalDateLabel("2027-08", now),
		"by end of August 2027"
	);
	eq(
		"year precision is just the year",
		finalDateLabel("2026", now),
		"by end of 2026"
	);
	eq(
		"a future bare year still just states the year — no 'end of 2027 2027'",
		finalDateLabel("2027", now),
		"by end of 2027"
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

	// ---------- recommended: factor priority ----------
	{
		// Factor 1 (urgent deadline) outranks factor 2 (possible today).
		const list = [
			someday("possible", { days: ["wed"] }),
			someday("urgent", { finalDate: "2026-07-20", days: ["sat"] }),
		];
		eq("an urgent deadline leads", order(list, "recommended", withNow), [
			"urgent",
			"possible",
		]);
	}
	{
		// Within the urgent tier, the nearest deadline leads.
		const list = [
			someday("far", { finalDate: "2026-08-10" }),
			someday("near", { finalDate: "2026-07-17" }),
		];
		eq("soonest deadline first", order(list, "recommended", withNow), [
			"near",
			"far",
		]);
	}
	{
		// Just outside the 30-day window isn't urgent.
		const list = [
			someday("beyond", { finalDate: "2026-08-20" }),
			someday("inside", { finalDate: "2026-08-13" }),
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
			someday("aaa expired", { finalDate: "2026-07-01" }),
			someday("zzz urgent", { finalDate: "2026-07-20" }),
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
				finalDate: "2026-07-01",
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
			someday("trip", { type: "longTrip" }),
			someday("plain"),
			someday("meal", { type: "food" }),
		];
		eq(
			"food leads, trips sink",
			order(list, "recommended", withNow),
			["meal", "plain", "trip"]
		);
	}
	{
		const list = [
			someday("drinks", { type: "drinks" }),
			someday("shortTrip", { type: "shortTrip" }),
		];
		eq(
			"short trips sink like long ones",
			order(list, "recommended", withNow),
			["drinks", "shortTrip"]
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
			someday("cheapTrip", { type: "longTrip", cost: 5 }),
			someday("dearMeal", { type: "food", cost: 500 }),
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
			someday("n", { type: "nature" }),
			someday("a", { type: "activity" }),
			someday("l", { type: "longTrip" }),
			someday("f", { type: "food" }),
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
			someday("other", { type: "other" }),
			someday("shopping", { type: "shopping" }),
			someday("activity", { type: "activity" }),
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
			someday("zzz other", { type: "other" }),
			someday("food", { type: "food" }),
		];
		eq(
			"an untyped someday sits below even Other",
			order(list, "type", withNow),
			["food", "zzz other", "aaa untyped"]
		);
	}
	{
		const list = [
			someday("⚾ Red Sox", { type: "game" }),
			someday("Aquarium", { type: "game" }),
			someday("Bakery", { type: "food" }),
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
		const list = [someday("stale", { type: "park" }), someday("live", { type: "food" })];
		eq(
			"an unknown type sorts as untyped rather than breaking",
			order(list, "type", withNow),
			["live", "stale"]
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
