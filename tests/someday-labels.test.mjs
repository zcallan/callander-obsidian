import { createSuite } from "./harness.mjs";
import {
	formatSomedayDays,
	formatSomedaySeasons,
	formatSomedaySeasonDeadline,
	formatSomedayTimes,
} from "./.build/callander.mjs";

/**
 * The short labels a someday row is built from. Fiddly by nature — the
 * day summary alone switches between four shapes and two separators —
 * and wrong output here reads as merely odd rather than broken, so it
 * would sit there unnoticed.
 */
export function run() {
	const { eq, result } = createSuite("someday labels");

	// ---------- days ----------
	eq("nothing chosen says nothing", formatSomedayDays([]), "");
	eq(
		"all seven is any day",
		formatSomedayDays(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
		"Any day"
	);
	eq(
		"the working week",
		formatSomedayDays(["mon", "tue", "wed", "thu", "fri"]),
		"Weekdays"
	);
	eq("the weekend", formatSomedayDays(["sat", "sun"]), "Weekends");
	eq(
		"two days keep the spaces",
		formatSomedayDays(["tue", "thu"]),
		"Tue / Thu"
	);
	eq(
		"three or more tighten up",
		formatSomedayDays(["mon", "tue", "thu", "fri"]),
		"Mon/Tue/Thu/Fri"
	);
	eq(
		"one missing names the exception",
		formatSomedayDays(["mon", "tue", "thu", "fri", "sat", "sun"]),
		"Any day but Wed"
	);
	eq(
		"two missing name both",
		formatSomedayDays(["mon", "tue", "fri", "sat", "sun"]),
		"Any day but Wed or Thu"
	);
	eq(
		"stored order doesn't matter — output is always Mon→Sun",
		formatSomedayDays(["sun", "thu", "mon"]),
		"Mon/Thu/Sun"
	);
	eq(
		"a single day stands alone",
		formatSomedayDays(["wed"]),
		"Wed"
	);
	eq(
		"unknown ids are ignored, not printed",
		formatSomedayDays(["mon", "someday-in-june"]),
		"Mon"
	);

	// ---------- season as a deadline ----------
	eq("no seasons, no deadline", formatSomedaySeasonDeadline([]), "");
	eq(
		"one season",
		formatSomedaySeasonDeadline(["summer"]),
		"by end of Summer"
	);
	eq(
		"a window closes with its last season",
		formatSomedaySeasonDeadline(["summer", "fall"]),
		"by end of Fall"
	);
	eq(
		"the order they were stored in doesn't matter",
		formatSomedaySeasonDeadline(["fall", "summer"]),
		"by end of Fall"
	);
	eq(
		"every season is no constraint at all",
		formatSomedaySeasonDeadline(["spring", "summer", "fall", "winter"]),
		""
	);
	eq(
		"a wrap-around window uses canonical order, not the calendar",
		formatSomedaySeasonDeadline(["winter", "spring"]),
		"by end of Winter"
	);

	// ---------- untouched neighbours ----------
	// formatSomedaySeasons still backs the view modal, so the deadline
	// phrasing must not have quietly replaced it.
	eq(
		"the plain season summary is unchanged",
		formatSomedaySeasons(["summer", "fall"]),
		"Summer / Fall"
	);
	eq(
		"all four still reads as any season there",
		formatSomedaySeasons(["spring", "summer", "fall", "winter"]),
		"Any season"
	);
	eq(
		"every time window is no constraint, so it says nothing",
		formatSomedayTimes(["morning", "daytime", "night"]),
		""
	);
	eq(
		"a real time window still shows",
		formatSomedayTimes(["morning", "night"]),
		"Morning / Night"
	);

	return result();
}
