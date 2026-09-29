import { createSuite } from "./harness.mjs";
import { chineseZodiac, formatFlexDate, parseFlexDate, possibleToday, quickDayDates } from "./.build/callander.mjs";

/** How dates, the zodiac and Somedays' day pills read, as the owner settled them (2026-09-28). */
export function run() {
	const { eq, result } = createSuite("display decisions");

	// Decision 9: day first, no comma, everywhere.
	eq(
		"flex dates read the Australian way",
		["2019", "2019-03", "2019-03-14", "03-14"].map((s) => formatFlexDate(parseFlexDate(s))),
		["2019", "March 2019", "14 March 2019", "14 March"]
	);

	// CP-B18: by lunar year. Lunar New Year falls between 21 Jan and 20 Feb.
	eq(
		"the zodiac by lunar year, honest about the window it can't settle",
		[
			chineseZodiac(2026, 1, 10),
			chineseZodiac(2026, 1, 25),
			chineseZodiac(2026, 2, 21),
			chineseZodiac(2026, 7, 1),
			chineseZodiac(2026, 2, null),
			chineseZodiac(2026),
		],
		["Year of the Snake", "Year of the Snake or Horse", "Year of the Horse", "Year of the Horse", "Year of the Snake or Horse", "Year of the Horse"]
	);

	// VW-B11: Today and Tomorrow each ask about their own date.
	const lastOfAutumn = new Date(2026, 10, 30, 12); // Monday 30 November
	const someday = (over) => ({ days: [], seasons: [], date: "", fromDate: "", untilDate: "", ...over });
	const fits = (s, id) => quickDayDates(id, lastOfAutumn).some((d) => possibleToday(s, d, "northern"));
	eq(
		"autumn's under Today and winter's under Tomorrow, on the last day of autumn",
		[someday({ seasons: ["fall"] }), someday({ seasons: ["winter"] })].map((s) => [fits(s, "today"), fits(s, "tomorrow")]),
		[[true, false], [false, true]]
	);
	eq("a window closing today isn't offered for tomorrow", [fits(someday({ untilDate: "2026-11-30" }), "today"), fits(someday({ untilDate: "2026-11-30" }), "tomorrow")], [true, false]);
	eq(
		"the dates each pill means",
		[quickDayDates("today", lastOfAutumn), quickDayDates("tomorrow", lastOfAutumn), quickDayDates("weekend", lastOfAutumn)].map((ds) => ds.map((d) => d.getDate())),
		[[30], [1], [5, 6]]
	);
	return result();
}
