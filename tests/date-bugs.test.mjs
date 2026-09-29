import { createSuite } from "./harness.mjs";
import {
	birthdayCalendar,
	buildGoogleCalendarUrl,
	buildTimelineCalendarUrl,
	eventRowFields,
	formatTimeSince,
	isoDaysBetween,
	planDays,
	planRowFields,
	planWhenDate,
	upcomingItems,
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

	// ---------- the rest of §5.2's date bugs ----------
	const event = (over = {}) => ({
		file: { path: "Friends/Events/E.md" }, name: "E", date: "", time: "", duration: "", type: "",
		people: [], location: "", link: "", description: "", status: "open", variant: "reminder",
		showOnTimelines: true, source: "", created: "", updated: "", ...over,
	});
	const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

	// UA-B1: an untimed event with a duration isn't over at 00:00 plus it.
	eq(
		"an untimed event with a duration stays on its own day (UA-B1)",
		upcomingItems([event({ name: "All day", date: "2026-08-05", duration: "1h" })], at(2026, 8, 5, 3)).map((i) => i.event.name),
		["All day"]
	);
	eq(
		"…while a timed one still goes once it's over",
		upcomingItems([event({ name: "Coffee", date: "2026-08-05", time: "01:00", duration: "1h" })], at(2026, 8, 5, 3)).map((i) => i.event.name),
		[]
	);

	// UA-B3: a month or a year has no day to count down to.
	const conversational = (date, now) => eventRowFields(event({ date }), now, "", { conversational: true }).relative;
	eq(
		"a month-precise event doesn't read today, or in 1 day (UA-B3)",
		[conversational("2026-09", at(2026, 9, 1)), conversational("2026-10", at(2026, 9, 30)), conversational("2027", at(2026, 12, 31))].some((r) => r === "today" || r === "in 1 day"),
		false
	);
	eq("…a day-precise one still does", conversational("2026-09-01", at(2026, 9, 1)), "today");

	// UA-B13: time since, counting the day when there is one.
	eq(
		"met 30 Sep 2025 is 11 months ago on 1 Sep 2026, not a year (UA-B13)",
		[formatTimeSince(parseFlexDate("2025-09-30"), at(2026, 9, 1)), formatTimeSince(parseFlexDate("2025-09-01"), at(2026, 9, 1)), formatTimeSince(parseFlexDate("2025-09"), at(2026, 9, 1))],
		["11 months ago", "1 year ago", "1 year ago"]
	);

	// UB-B5: a long plan is filed by its real last day.
	eq("a four-month plan ends when it ends, not 62 days in (UB-B5)", planWhenDate({ date: "2026-06-01", endDate: "2026-09-30" }), "2026-09-30");
	eq("…while its calendar bar still stops at 62 days", planDays({ date: "2026-06-01", endDate: "2026-09-30" }).length, 62);

	// UB-B6: a year-less end date after New Year.
	const trip = { name: "New Year trip", date: "2026-12-30", endDate: "01-02", location: "" };
	eq(
		"30 Dec to 2 Jan reads today on the 31st and on the 2nd (UB-B6)",
		[planRowFields(trip, at(2026, 12, 31)).relative, planRowFields(trip, at(2027, 1, 2)).relative],
		["today", "today"]
	);

	// UB-B8 and UB-B11: daylight saving at midnight, and the night clocks go back.
	const zone = process.env.TZ;
	try {
		process.env.TZ = "America/Santiago"; // clocks go forward at midnight on 6 September 2026
		eq(
			"a day walk across a midnight change keeps its last day (UB-B8)",
			[planDays({ date: "2026-09-05", endDate: "2026-09-08" }), isoDaysBetween("2026-09-05", "2026-09-08")],
			[["2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08"], ["2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08"]]
		);
		process.env.TZ = "Australia/Sydney"; // 03:00 goes back to 02:00 on 5 April 2026
		const dates = (url) => new URL(url).searchParams.get("dates");
		eq(
			"an hour from 02:30 as the clocks go back has an hour's length (UB-B11)",
			[
				dates(buildGoogleCalendarUrl({ name: "Late", type: "", date: "2026-04-05", time: "02:30", duration: "1h", location: "", description: "", link: "" })),
				dates(buildTimelineCalendarUrl({ date: "2026-04-05", time: "02:30", duration: "1h", text: "Late", source: "idea" })),
			],
			["20260405T023000/20260405T033000", "20260405T023000/20260405T033000"]
		);
	} finally {
		if (zone === undefined) delete process.env.TZ;
		else process.env.TZ = zone;
	}
	return result();
}
