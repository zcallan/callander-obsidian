import { createSuite } from "./harness.mjs";
import {
	mergeUpcoming,
	splitOverdue,
	thisAndNextWeek,
	upcomingItems,
	upcomingPlans,
} from "./.build/callander.mjs";

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
	// A task keeps asking to be ticked off until someone does; any other
	// passed event is implicitly done once its day is over.
	eq(
		"a task passed 3 days ago still asks",
		names(upcomingItems([ev({ name: "task", type: "task", date: "2026-08-02" })], now)),
		["task"]
	);
	eq(
		"...and still asks weeks later",
		names(upcomingItems([ev({ name: "task", type: "task", date: "2026-07-20" })], now)),
		["task"]
	);
	eq(
		"...and months later — being avoided is not a reason to disappear",
		names(upcomingItems([ev({ name: "task", type: "task", date: "2026-02-11" })], now)),
		["task"]
	);
	eq(
		"a passed task is flagged overdue",
		upcomingItems([ev({ name: "task", type: "task", date: "2026-07-20" })], now)[0]
			?.overdue,
		true
	);
	eq(
		"a task still ahead is not",
		upcomingItems([ev({ name: "task", type: "task", date: "2026-08-20" })], now)[0]
			?.overdue,
		undefined
	);
	eq(
		"a ticked-off task is gone whatever its date",
		names(
			upcomingItems(
				[ev({ name: "task", type: "task", date: "2026-07-20", status: "done" })],
				now
			)
		),
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
	{
		// A long-overdue task escapes the window entirely. Falling out of
		// a fortnight is exactly how the ones you've been avoiding used to
		// vanish, which is the opposite of what they're for.
		const list = upcomingItems(
			[ev({ name: "months late", date: "2026-03-02", type: "task" })],
			now
		);
		eq(
			"an overdue task ignores the fortnight",
			names(thisAndNextWeek(list, now)),
			["months late"]
		);
	}

	// ---------- overdue leads its own group ----------
	{
		const entries = mergeUpcoming(
			upcomingItems(
				[
					ev({ name: "late task", date: "2026-07-01", type: "task" }),
					ev({ name: "soon", date: "2026-08-06" }),
				],
				now
			),
			[]
		);
		const { overdue, rest } = splitOverdue(entries);
		eq("the late task is pulled out", overdue.map((e) => e.event.name), [
			"late task",
		]);
		eq("everything else stays put", rest.map((e) => e.event.name), ["soon"]);
	}

	// ---------- plans on the same list ----------
	const plan = (name, date, status = "planning", extra = {}) => ({
		file: { path: name },
		name,
		date,
		endDate: "",
		location: "",
		status,
		items: [],
		members: [],
		hiddenFromUpcoming: false,
		...extra,
	});
	{
		const plans = upcomingPlans(
			[
				plan("Soon", "2026-09-20"),
				plan("Gone", "2026-08-01"),
				plan("Finished", "2026-09-20", "done"),
				// Somebody said "we should do that" and the date came later.
				plan("Undated", ""),
			],
			now
		);
		eq("only what's still ahead", plans.map((p) => p.plan.name), ["Undated", "Soon"]);
		// Keyed to 0 like an undated event, so it leads rather than sorting
		// to some arbitrary date — it's the one that gets forgotten.
		eq("an undated plan leads", plans[0]?.key, 0);
		eq("and carries no countdown", plans[0]?.days, null);
	}
	{
		// Hidden by hand, from this list only — it stays a plan, and the
		// Plans section is where it gets put back.
		const plans = upcomingPlans(
			[
				plan("Shown", "2026-09-20"),
				plan("Hidden", "2026-09-21", "planning", {
					hiddenFromUpcoming: true,
				}),
			],
			now
		);
		eq("a hidden plan is left off", plans.map((p) => p.plan.name), ["Shown"]);
	}
	{
		// One list, because "what's coming up" is one question.
		const merged = mergeUpcoming(
			[
				{ event: { file: { path: "e" }, name: "Event" }, key: 20260920, days: 11 },
			],
			[{ plan: plan("Plan", "2026-09-18"), key: 20260918, days: 9 }]
		);
		eq("they interleave by date", merged.map((i) => i.kind), ["plan", "event"]);
		eq("and say which they are", merged[0]?.kind, "plan");
	}
	{
		// A plan is the container for a day and the events are what happens
		// in it, so the plan leading reads right when they tie.
		const merged = mergeUpcoming(
			[{ event: { file: { path: "e" }, name: "Event" }, key: 20260918, days: 9 }],
			[{ plan: plan("Plan", "2026-09-18"), key: 20260918, days: 9 }]
		);
		eq("a tie puts the plan first", merged.map((i) => i.kind), ["plan", "event"]);
	}
	eq("nothing in, nothing out", mergeUpcoming([], []), []);

	// ---------- the window follows the week-start setting ----------
	// `now` is Wednesday 5 August 2026. A Monday week opened 2 days ago, a
	// Sunday week 3 — so something 3 days back is inside one and not the
	// other. Measuring from a Monday while the calendars count from a
	// Sunday would put the fortnight's edge in a different place on the two
	// pages.
	{
		const item = (days) => ({ days });
		const window = (startsOn) =>
			thisAndNextWeek(
				[item(-3), item(-2), item(0), item(10), item(11), item(12)],
				now,
				startsOn
			).map((i) => i.days);
		eq("a Monday week reaches back two days", window(1), [-2, 0, 10, 11]);
		eq("a Sunday week reaches back three", window(0), [-3, -2, 0, 10]);
		// Fourteen days wide either way — the edge moves, the span doesn't.
		eq("both spans are a fortnight", [window(1).length, window(0).length], [4, 4]);
	}

	{
		// Monday 21 Sept: nine events this week, five next — fourteen, more
		// than the ten-row cap the section used to apply. That cap trimmed
		// from the end, so Saturday 3 Oct (next week) was the first to go.
		// Nothing inside the fortnight is held back now.
		const mon = new Date(2026, 8, 21);
		const dates = [
			"2026-09-22", "2026-09-23", "2026-09-24", "2026-09-24", "2026-09-25",
			"2026-09-26", "2026-09-26", "2026-09-27", "2026-09-27",
			"2026-09-30", "2026-09-30", "2026-10-03", "2026-10-04", "2026-10-04",
		];
		const list = upcomingItems(
			dates.map((date, i) => ev({ name: `e${i}`, date })),
			mon
		);
		eq(
			"a fortnight of fourteen shows all fourteen",
			thisAndNextWeek(list, mon).length,
			14
		);
		eq(
			"...including Saturday 3 Oct, across the month boundary",
			names(thisAndNextWeek(list, mon)).includes("e11"),
			true
		);
		eq(
			"...and Sunday the 4th, the last day of next week",
			names(thisAndNextWeek(list, mon)).includes("e13"),
			true
		);
		eq(
			"Monday the 5th is the week after, and stays out",
			names(
				thisAndNextWeek(
					upcomingItems([ev({ name: "later", date: "2026-10-05" })], mon),
					mon
				)
			),
			[]
		);
	}
	{
		// A plan has no overdue state — upcomingPlans already drops one
		// whose date has gone by — so the split must never claim one.
		const entries = mergeUpcoming(
			[],
			upcomingPlans([plan("trip", "2026-08-10")], now)
		);
		eq("a plan is never overdue", splitOverdue(entries).overdue, []);
	}

	return result();
}
