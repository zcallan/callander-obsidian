import { createSuite } from "./harness.mjs";
import {
	PLAN_SORTS,
	PLAN_WHEN_FILTERS,
	readsBackwards,
	planListItem,
	planMatchesSearch,
	planPipeline,
	planSortOf,
} from "./.build/callander.mjs";

/**
 * The All plans page's list. It's the Events page's rules pointed at plans,
 * so the interesting cases are the ones where a plan differs from an event:
 * it spans days (so "past" means its last day, not its first), it has no
 * type, and it may be hidden from other lists but must not be from this one.
 */

function plan(over = {}) {
	const name = over.name ?? "Trip";
	return {
		file: { path: `Plans/${name}.md` },
		name,
		date: "",
		endDate: "",
		location: "",
		status: "planning",
		created: "",
		updated: "",
		items: [],
		members: [],
		hiddenFromUpcoming: false,
		hiddenFromEvents: false,
		...over,
	};
}

export function run() {
	const { eq, ok, result } = createSuite("plan list");

	const now = new Date(2026, 8, 21); // Monday 21 September 2026
	const items = (...plans) => plans.map((p) => planListItem(plan(p)));
	// People resolve to whatever the test says they are — no metadata cache.
	const nobody = { paths: () => [], names: () => "" };
	const run = (list, filters, sort = "natural", lookup = nobody) =>
		planPipeline(
			list,
			{ when: "all", status: "", personPath: "", query: "", ...filters },
			sort,
			lookup,
			now
		).map((i) => i.name);

	// ---------- Upcoming / Past judge a plan by its last day ----------
	{
		const list = items(
			{ name: "gone", date: "2026-08-01" },
			{ name: "underway", date: "2026-09-19", endDate: "2026-09-23" },
			{ name: "ahead", date: "2026-10-10" }
		);
		eq("Upcoming keeps a trip that's underway", run(list, { when: "upcoming" }), [
			"underway",
			"ahead",
		]);
		eq("...and Past takes only one that's over", run(list, { when: "past" }), ["gone"]);
		eq("All has everything", run(list, {}).length, 3);
	}
	eq(
		"a plan with no date yet counts as ahead",
		run(items({ name: "someday-ish" }), { when: "upcoming" }),
		["someday-ish"]
	);
	eq(
		"a month-only date is judged by that month",
		run(items({ name: "oct", date: "2026-10" }), { when: "upcoming" }),
		["oct"]
	);

	// ---------- every plan is here, hidden or not ----------
	// hiddenFromUpcoming / hiddenFromEvents keep a busy list short. This
	// page is where they're all meant to be, or a hidden trip would be
	// unreachable from anywhere but its own file.
	{
		const list = items(
			{ name: "hidden both", date: "2026-10-01", hiddenFromUpcoming: true, hiddenFromEvents: true },
			{ name: "shown", date: "2026-10-02" }
		);
		eq("hidden plans still appear", run(list, { when: "upcoming" }), [
			"hidden both",
			"shown",
		]);
	}

	// ---------- status ----------
	{
		const list = items(
			{ name: "a", date: "2026-10-01", status: "planning" },
			{ name: "b", date: "2026-10-02", status: "done" }
		);
		eq("a status narrows to it", run(list, { status: "done" }), ["b"]);
		eq("no status is any", run(list, { status: "" }).sort(), ["a", "b"]);
	}

	// ---------- people ----------
	{
		const list = items(
			{ name: "with sally", date: "2026-10-01", members: ["[[Sally]]"] },
			{ name: "solo", date: "2026-10-02" }
		);
		const lookup = {
			paths: (i) => (i.name === "with sally" ? ["People/Sally.md"] : []),
			names: (i) => (i.name === "with sally" ? "Sally Rooney" : ""),
		};
		eq(
			"a person narrows to their plans",
			run(list, { personPath: "People/Sally.md" }, "natural", lookup),
			["with sally"]
		);
		eq(
			"and is searchable by full name",
			run(list, { query: "rooney" }, "natural", lookup),
			["with sally"]
		);
	}

	// ---------- search ----------
	ok("matches the name", planMatchesSearch({ name: "Maine trip", location: "" }, "maine", ""));
	ok("...or the place", planMatchesSearch({ name: "Trip", location: "Portland, ME" }, "portland", ""));
	ok("...or the people", planMatchesSearch({ name: "Trip", location: "" }, "haruki", "Haruki Murakami"));
	ok("...and nothing else", !planMatchesSearch({ name: "Trip", location: "Maine" }, "dinner", "Sally"));
	ok("an empty search matches everything", planMatchesSearch({ name: "x", location: "" }, "", ""));

	// ---------- ordering ----------
	{
		const list = items(
			{ name: "c", date: "2026-10-30", created: "2026-01-05", updated: "2026-03-01" },
			{ name: "a", date: "2026-10-10", created: "2026-02-05", updated: "2026-09-01" },
			{ name: "b", date: "2026-10-20", created: "2026-03-05", updated: "2026-05-01" }
		);
		// Only Upcoming reads forwards. All puts the furthest-off first, so
		// the page doesn't open on whichever trip was made years ago.
		eq("Natural under Upcoming is soonest first", run(list, { when: "upcoming" }, "natural"), ["a", "b", "c"]);
		eq("...and under All it's latest first", run(list, { when: "all" }, "natural"), ["c", "b", "a"]);
		eq("Newest is latest date first", run(list, {}, "newest"), ["c", "b", "a"]);
		eq("Oldest is by when the note was made", run(list, {}, "oldest"), ["c", "a", "b"]);
		eq("Last updated is most recent edit first", run(list, {}, "updated"), ["a", "b", "c"]);
		eq("Name A–Z", run(list, {}, "nameAsc"), ["a", "b", "c"]);
		eq("Name Z–A", run(list, {}, "nameDesc"), ["c", "b", "a"]);
	}
	{
		const past = items(
			{ name: "older", date: "2026-05-01" },
			{ name: "recent", date: "2026-08-01" }
		);
		eq(
			"under Past, the most recent trip leads",
			run(past, { when: "past" }, "natural"),
			["recent", "older"]
		);
	}

	// ---------- reading direction ----------
	{
		const list = items(
			{ name: "long ago", date: "2024-03-01" },
			{ name: "last month", date: "2026-08-15" },
			{ name: "next month", date: "2026-10-15" },
			{ name: "next year", date: "2027-05-01" }
		);
		eq(
			"All opens on the furthest-off, oldest at the bottom",
			run(list, { when: "all" }),
			["next year", "next month", "last month", "long ago"]
		);
		eq(
			"Upcoming is still soonest first",
			run(list, { when: "upcoming" }),
			["next month", "next year"]
		);
		eq(
			"Past is most recent first",
			run(list, { when: "past" }),
			["last month", "long ago"]
		);
		// The List sinks a plan with no date whichever way the rest reads,
		// as the Events page does — reversing the direction must not float
		// the unknowns to the top.
		const withUndated = items(
			{ name: "undated" },
			{ name: "dated", date: "2026-10-15" },
			{ name: "later", date: "2027-01-01" }
		);
		eq(
			"an undated plan sinks under All",
			run(withUndated, { when: "all" }),
			["later", "dated", "undated"]
		);
		eq(
			"...and under Upcoming, where it's still ahead",
			run(withUndated, { when: "upcoming" }),
			["dated", "later", "undated"]
		);
		eq("only Upcoming reads forwards", [
			readsBackwards("upcoming"),
			readsBackwards("all"),
			readsBackwards("past"),
		], [false, true, true]);
	}
	eq(
		"All comes first, then Upcoming and Past",
		PLAN_WHEN_FILTERS.map((w) => w.id),
		["all", "upcoming", "past"]
	);

	// ---------- the sort list ----------
	eq(
		"Type is left off — every plan is a plan",
		PLAN_SORTS.some((s) => s.id === "type"),
		false
	);
	eq(
		"the rest of the Events sorts are kept",
		PLAN_SORTS.map((s) => s.id),
		["natural", "newest", "oldest", "updated", "nameAsc", "nameDesc"]
	);
	eq("a sort this page offers is kept", planSortOf("nameDesc"), "nameDesc");
	eq("'type' falls back to Natural", planSortOf("type"), "natural");
	eq("so does anything unrecognised", planSortOf("soonest"), "natural");

	return result();
}
