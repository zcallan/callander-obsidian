import { createSuite } from "./harness.mjs";
import { isPastDays, laneRuns, visibleSlots } from "./.build/callander.mjs";

/** The month board's layout rules, moved out of its cell builder. */
export function run() {
	const { eq, result } = createSuite("calendar board rules");

	eq(
		"all of them when they fit, else one slot fewer for a +N",
		[visibleSlots(0, 3), visibleSlots(3, 3), visibleSlots(4, 3), visibleSlots(9, 3), visibleSlots(2, 1), visibleSlots(1, 0)],
		[3, 3, 2, 2, 0, 0]
	);

	eq(
		"past means its last day is before today",
		[isPastDays(["2026-08-01", "2026-08-04"], "2026-08-05"), isPastDays(["2026-08-04", "2026-08-05"], "2026-08-05"), isPastDays([], "2026-08-05")],
		[true, false, false]
	);

	// 3–5 Aug 2026 is Monday–Wednesday; a Monday-start week.
	const plans = [{ key: "trip" }, { key: "gig" }];
	const lanes = new Map([["trip", 0], ["gig", 2]]);
	const spanDays = new Map([["trip", ["2026-08-03", "2026-08-04", "2026-08-05"]], ["gig", ["2026-08-04"]]]);
	const on = (date) =>
		laneRuns(plans, (p) => lanes.get(p.key), spanDays, date, 1).map(({ held, run }) => [held?.key ?? null, run && run.opens, run && run.length]);
	eq("lanes up to the highest used, a gap held empty", on("2026-08-04"), [["trip", false, 2], [null, null, null], ["gig", true, 1]]);
	eq("the day a run opens", on("2026-08-03")[0], ["trip", true, 3]);
	eq("no plans, no lanes", laneRuns([], () => 0, new Map(), "2026-08-03", 1), []);
	return result();
}
