import { createSuite } from "./harness.mjs";
import {
	birthdayCalendar,
	buildTimelineCalendarUrl,
	formatTimelineDay,
	isFlexWithinLastMonths,
	lastUpdatedLabel,
	monthStep,
	nextBirthdayOccurrence,
	parseFlexDate,
	planWhenLabel,
} from "./.build/callander.mjs";

/** Date bugs from the review (§5.2), each pinned by the case that showed it. */
export function run() {
	const { eq, result } = createSuite("date bugs");

	// UB-B7: a 29 Feb birthday, from March of the year before a leap year.
	eq(
		"29 February lands on the 29th in a leap year (UB-B7)",
		nextBirthdayOccurrence("2000-02-29", new Date(2027, 2, 15, 12)).date,
		"2028-02-29"
	);
	eq("…and on 1 March in a common year, as before", nextBirthdayOccurrence("2000-02-29", new Date(2026, 2, 15, 12)).date, "2027-03-01");

	// CORE-B4: the calendar export's DTSTART must be a real date.
	const { ics } = birthdayCalendar([{ basename: "Leap", displayName: "Leap", birthday: "2000-02-29" }], new Date(Date.UTC(2026, 7, 5, 12)));
	eq("the export writes 1 March, not 29 February, in a common year (CORE-B4)", ics.split("\r\n").find((l) => l.startsWith("DTSTART")), "DTSTART;VALUE=DATE:20270301");

	// VW-B3: stepping a month from the 31st.
	eq(
		"month paging from the 31st neither skips nor stalls (VW-B3)",
		[monthStep(new Date(2026, 9, 31), 1), monthStep(new Date(2026, 2, 31), -1), monthStep(new Date(2026, 11, 15), 1)].map((d) => [d.getFullYear(), d.getMonth() + 1]),
		[[2026, 11], [2026, 2], [2027, 1]]
	);

	// UA-B9: "the last month" on 31 March reaches back into February.
	eq("the last month on 31 March includes 28 February (UA-B9)", isFlexWithinLastMonths(parseFlexDate("2026-02-28"), 1, new Date(2026, 2, 31, 12)), true);
	eq("…but not 27 February", isFlexWithinLastMonths(parseFlexDate("2026-02-27"), 1, new Date(2026, 2, 31, 12)), false);

	// UA-B12, IMPL-8: what the parser accepts.
	eq("a string year below 1000 is refused, as a numeric one is (UA-B12)", [parseFlexDate("0099"), parseFlexDate("0099-05"), parseFlexDate("0099-05-01")], [null, null, null]);
	eq(
		"a day beyond its month is refused (IMPL-8)",
		[parseFlexDate("2019-02-30"), parseFlexDate("2019-02-29"), parseFlexDate("2020-02-29") !== null, parseFlexDate("2026-04-31"), parseFlexDate("02-31"), parseFlexDate("02-29") !== null],
		[null, null, true, null, null, true]
	);

	// UB-B16: a month-precision value isn't a day.
	eq("a YYYY-MM item gets no calendar link and no day heading (UB-B16)", [buildTimelineCalendarUrl({ date: "2026-07", text: "x", source: "idea" }), formatTimelineDay("2026-07")], [null, "2026-07"]);

	// CP-B19 and the plan countdown's missing "yesterday".
	const now = new Date(2026, 7, 5, 12);
	eq("an mtime ahead of the clock reads today, not -2 days ago (CP-B19)", lastUpdatedLabel(new Date(2026, 7, 7), now), "today");
	eq("the day after a plan reads yesterday, not 1 days ago", planWhenLabel("2026-08-04", "", now).endsWith(" · yesterday"), true);
	return result();
}
