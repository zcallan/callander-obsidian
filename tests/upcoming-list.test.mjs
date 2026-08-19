import { createSuite } from "./harness.mjs";
import { upcomingItems, withinWindow } from "./.build/callander.mjs";

/**
 * What reaches the dashboard's Upcoming section. These rules used to live
 * inline in the view and were never tested — "why isn't my event showing?"
 * has six possible answers, and every one of them is here.
 */
export function run() {
	const { eq, result } = createSuite("upcoming list");

	const now = new Date(2026, 7, 5); // Wednesday 5 August 2026
	const ev = (over = {}) => ({
		file: { path: `Events/${over.name ?? "E"}.md` },
		name: "E",
		date: "",
		time: "",
		type: "",
		people: [],
		location: "",
		link: "",
		description: "",
		status: "open",
		variant: "reminder",
		showOnTimelines: true,
		source: "",
		created: "2026-01-01",
		updated: "2026-01-01",
		...over,
	});
	const names = (list) => list.map((i) => i.event.name);

	// ---------- what's excluded, and why ----------
	eq(
		"a timeline entry never reaches the dashboard",
		names(upcomingItems([ev({ name: "t", variant: "timeline", date: "2026-09-01" })], now)),
		[]
	);
	eq(
		"a done event doesn't either",
		names(upcomingItems([ev({ name: "d", status: "done", date: "2026-09-01" })], now)),
		[]
	);
	// The reason this section exists to be verified: cancelling has to
	// actually remove it from what's coming up.
	eq(
		"a cancelled event drops off",
		names(upcomingItems([ev({ name: "c", status: "cancelled", date: "2026-09-01" })], now)),
		[]
	);
	eq(
		"...while the same event open stays",
		names(upcomingItems([ev({ name: "c", date: "2026-09-01" })], now)),
		["c"]
	);

	// ---------- what's included ----------
	eq(
		"a future event is included",
		names(upcomingItems([ev({ name: "f", date: "2026-09-01" })], now)),
		["f"]
	);
	eq(
		"today counts as upcoming",
		names(upcomingItems([ev({ name: "today", date: "2026-08-05" })], now)),
		["today"]
	);
	eq(
		"a passed event is not",
		names(upcomingItems([ev({ name: "gone", date: "2026-07-01" })], now)),
		[]
	);
	// A task keeps asking to be ticked off for a week after its date; any
	// other passed event is implicitly done.
	eq(
		"a task passed 3 days ago still asks",
		names(upcomingItems([ev({ name: "task", type: "task", date: "2026-08-02" })], now)),
		["task"]
	);
	eq(
		"...but not after a week",
		names(upcomingItems([ev({ name: "task", type: "task", date: "2026-07-20" })], now)),
		[]
	);

	// ---------- ordering ----------
	{
		const list = upcomingItems(
			[
				ev({ name: "later", date: "2026-12-01" }),
				ev({ name: "undated" }),
				ev({ name: "sooner", date: "2026-08-20" }),
			],
			now
		);
		// Undated is keyed to 0 so it leads — it's actionable now, where a
		// dated one is actionable then.
		eq("undated leads, then by date", names(list), [
			"undated",
			"sooner",
			"later",
		]);
	}

	// ---------- the near-horizon window ----------
	{
		const list = upcomingItems(
			[
				ev({ name: "near", date: "2026-08-20" }),
				ev({ name: "far", date: "2027-06-01" }),
				ev({ name: "undated" }),
			],
			now
		);
		eq("the window keeps what's close", names(withinWindow(list, 30)), [
			"undated",
			"near",
		]);
		// An undated item has no distance, so no window can put it beyond.
		eq(
			"...and always keeps the undated",
			names(withinWindow(list, 1)),
			["undated"]
		);
	}

	return result();
}
