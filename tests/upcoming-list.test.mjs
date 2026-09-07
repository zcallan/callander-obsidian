import { createSuite } from "./harness.mjs";
import { upcomingItems, thisAndNextWeek } from "./.build/callander.mjs";

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

	// ---------- this week and next ----------
	{
		// Wednesday 19 August 2026: this week opened Monday the 17th and
		// next week closes Sunday the 30th.
		const wed = new Date(2026, 7, 19);
		const list = upcomingItems(
			[
				// A task, because upcomingItems drops any other event once
				// its date has passed — a passed task is the only thing that
				// can sit behind today, and the window has to reach it.
				ev({ name: "monday task", date: "2026-08-17", type: "task" }),
				ev({ name: "next sunday", date: "2026-08-30" }),
				ev({ name: "day after", date: "2026-08-31" }),
				ev({ name: "far", date: "2027-06-01" }),
				ev({ name: "undated" }),
			],
			wed
		);
		eq("the fortnight keeps what's inside it", names(thisAndNextWeek(list, wed)), [
			"undated",
			"monday task",
			"next sunday",
		]);
		// The day either side of the span is the whole test: a rolling
		// 14-day count from Wednesday would have swallowed the 31st.
		eq(
			"and drops the day after it closes",
			names(thisAndNextWeek(list, wed)).includes("day after"),
			false
		);
		// An undated item has no distance, so no window can put it beyond.
		eq(
			"...while the undated always stays",
			names(thisAndNextWeek(list, wed)).includes("undated"),
			true
		);
	}

	return result();
}
