import { createSuite } from "./harness.mjs";
import {
	flexToLocalDate,
	isExactFlexDate,
	monthName,
	parseFlexDate,
	shortMonthName,
} from "./.build/callander.mjs";

/** The day-precision guard and the month names the short formats share. */
export function run() {
	const { eq, ok, result } = createSuite("flexdate exact days");

	eq(
		"only a date known to the day is exact",
		["2026-03-07", "2026-03", "2026", "--03-07", ""].map((s) =>
			isExactFlexDate(parseFlexDate(s))
		),
		[true, false, false, false, false]
	);
	ok("null and undefined aren't exact", !isExactFlexDate(null) && !isExactFlexDate(undefined));

	const d = flexToLocalDate(parseFlexDate("2026-03-07"));
	eq("the local day it names, at midnight", [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 2, 7, 0]);

	eq("three letters, by hand", [1, 5, 9].map(shortMonthName), ["Jan", "May", "Sep"]);
	eq("the full name beside it", monthName(7), "July");
	eq("out of range reads empty", [shortMonthName(0), shortMonthName(13)], ["", ""]);

	return result();
}
