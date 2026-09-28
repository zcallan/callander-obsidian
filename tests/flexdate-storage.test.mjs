import { createSuite } from "./harness.mjs";
import {
	flexPrecision,
	flexSortKey,
	formatFlexDate,
	formatTimeSince,
	monthName,
	parseFlexDate,
	toFlexString,
	todayISO,
} from "./.build/callander.mjs";

/**
 * How a FlexDate is read, written back and shown. Every date the plugin
 * stores goes through these, so today's rules are pinned exactly, loose
 * ones included, before the date helpers are consolidated. A rule changed
 * on purpose should change here in the same commit.
 */
export function run() {
	const { eq, ok, result } = createSuite("flexdate storage");
	const parse = parseFlexDate;
	const at = (year, month, day) => ({ year, month, day });

	// ---------- reading ----------
	eq("a year", parse("2019"), at(2019, null, null));
	eq("a month, padded or not", [parse("2019-03"), parse("2019-3")], [at(2019, 3, null), at(2019, 3, null)]);
	eq("a day, padded or not", [parse("2019-03-14"), parse("2019-3-4")], [at(2019, 3, 14), at(2019, 3, 4)]);
	eq("a birthday with no year", [parse("03-14"), parse("3-4")], [at(null, 3, 14), at(null, 3, 4)]);
	eq("surrounding spaces are ignored", parse(" 2019-03-14 "), at(2019, 3, 14));
	eq("YAML's bare-number year", parse(2019), at(2019, null, null));
	eq(
		"refused: a month out of range",
		[parse("2019-13"), parse("2019-00"), parse("13-01")],
		[null, null, null]
	);
	eq(
		"refused: a day past 31, or 0",
		[parse("2019-02-32"), parse("2019-03-00"), parse("02-32")],
		[null, null, null]
	);
	eq(
		"refused: a year that isn't four digits",
		[parse("999"), parse("10000"), parse("19"), parse(999), parse(10000), parse(2019.5)],
		[null, null, null, null, null, null]
	);
	eq(
		"refused: other separators, orders and times",
		[parse("2019/03/14"), parse("14/03/2019"), parse("2019-03-14T10:00")],
		[null, null, null]
	);
	eq("nothing is nothing", [parse(null), parse(undefined), parse("")], [null, null, null]);
	// Today's rule, loose on purpose or not: a day is checked against 31,
	// not against its month.
	eq("a 30 February is read, not refused", [parse("2019-02-30"), parse("02-30")], [at(2019, 2, 30), at(null, 2, 30)]);

	// ---------- writing back ----------
	eq(
		"stored zero-padded, at the precision given",
		["2019", "2019-3", "2019-3-4", "3-4"].map((s) => toFlexString(parse(s))),
		["2019", "2019-03", "2019-03-04", "03-04"]
	);
	eq(
		"a month with neither year nor day can't be stored",
		toFlexString(at(null, 3, null)),
		""
	);

	// ---------- showing ----------
	eq(
		"shown at the precision recorded",
		["2019", "2019-03", "2019-03-14", "03-14"].map((s) => formatFlexDate(parse(s))),
		["2019", "March 2019", "March 14, 2019", "March 14"]
	);
	eq("month names, and nothing outside 1–12", [1, 12, 0, 13].map(monthName), ["January", "December", "", ""]);
	eq(
		"precision",
		["2026", "2026-05", "2026-05-12", "05-12"].map((s) => flexPrecision(parse(s))),
		["year", "month", "day", "day"]
	);
	eq(
		"a coarser date sorts before a finer one in the same period",
		["2026", "2026-05", "2026-05-12", "05-12"].map((s) => flexSortKey(parse(s))),
		[20260000, 20260500, 20260512, 512]
	);

	// ---------- time since ----------
	const now = new Date(2026, 7, 5); // 5 August 2026
	const since = (s) => formatTimeSince(parse(s), now);
	eq(
		"by year",
		["2021", "2025", "2026", "2027"].map(since),
		["5 years ago", "1 year ago", "this year", "this year"]
	);
	eq(
		"by month",
		["2026-08", "2026-07", "2026-03", "2025-09", "2025-08", "2024-02"].map(since),
		["this month", "1 month ago", "5 months ago", "11 months ago", "1 year ago", "2 years ago"]
	);
	eq("a future month is this month", since("2026-10"), "this month");
	eq("the day doesn't count, only its month", since("2026-08-31"), "this month");
	eq("no year, no time since", since("08-04"), "");

	// ---------- today ----------
	const stamp = /^\d{4}-\d{2}-\d{2}$/;
	ok("today is a local YYYY-MM-DD stamp", stamp.test(todayISO()));

	return result();
}
