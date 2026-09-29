import { createSuite } from "./harness.mjs";
import {
	exactPlanDay,
	fieldEditText,
	fieldEditValue,
	formatPlanDateRange,
	ideaLogText,
	interestIdeaText,
	isFilledField,
	isoDaysBetween,
	lastUpdatedLabel,
	normalizeIdeaCategory,
	normalizeInterestCategory,
	parseFunFacts,
	planWhenLabel,
} from "./.build/callander.mjs";

/** The contact page's rules, as the page applied them before they moved. */
export function run() {
	const { eq, result } = createSuite("contact page rules");
	const now = new Date(2026, 7, 5, 15); // 5 Aug 2026, mid-afternoon

	eq(
		"last updated",
		[
			lastUpdatedLabel(new Date(2026, 7, 5, 9), now),
			lastUpdatedLabel(new Date(2026, 7, 4, 23), now),
			lastUpdatedLabel(new Date(2026, 6, 6), now),
			lastUpdatedLabel(new Date(2026, 6, 5), now),
		],
		["today", "yesterday", "30 days ago", new Date(2026, 6, 5).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })]
	);

	const range = (d, e) => formatPlanDateRange(d, e);
	eq(
		"a plan's date line, with its countdown",
		[
			planWhenLabel("2026-08-05", "", now),
			planWhenLabel("2026-08-06", "", now),
			planWhenLabel("2026-08-10", "2026-08-12", now),
			planWhenLabel("2026-08-01", "", now),
		],
		[`${range("2026-08-05", "")} · today!`, `${range("2026-08-06", "")} · tomorrow`, `${range("2026-08-10", "2026-08-12")} · in 5 days`, `${range("2026-08-01", "")} · 4 days ago`]
	);
	eq("a month-only date has no countdown; no date, no line", [planWhenLabel("2026-09", "", now), planWhenLabel("", "", now), planWhenLabel(undefined, undefined, now)], [range("2026-09", ""), null, null]);
	eq("a year-less date counts towards this year's", planWhenLabel("08-07", "", now), `${range("08-07", "")} · in 2 days`);

	eq(
		"what a done idea logs as",
		[
			ideaLogText({ category: "gift", text: "A book" }),
			ideaLogText({ category: "place", text: "The lake" }),
			ideaLogText({ category: "other", text: "Thing" }),
			ideaLogText({ category: "retired", text: "Old" }),
		],
		["Gave: A book", "Went to: The lake", "Thing", "Old"]
	);
	eq("unknown idea categories read as other", [normalizeIdeaCategory({ category: "gift" }), normalizeIdeaCategory({ category: "nope" })], ["gift", "other"]);
	eq(
		"interest categories, legacy ones mapped",
		["movie", "screen", "musicgenre", "nope"].map((category) => normalizeInterestCategory({ category })),
		["movie", "movie", "music", "other"]
	);
	eq(
		"fun facts: a list, or a legacy string split on lines and ' · '",
		[parseFunFacts([" a ", "", 3]), parseFunFacts("one\r\ntwo · three"), parseFunFacts(undefined), parseFunFacts({})],
		[["a", "3"], ["one", "two", "three"], [], []]
	);
	eq("an interest's idea text", [interestIdeaText({ text: "East of Eden", detail: "John Steinbeck" }), interestIdeaText({ text: "Chess" })], ["East of Eden (John Steinbeck)", "Chess"]);
	eq("an exact plan day", [exactPlanDay("2026-08-05"), exactPlanDay("2026-08"), exactPlanDay(undefined)], ["2026-08-05", null, null]);
	eq(
		"days between, inclusive, and nothing backwards or unparseable",
		[isoDaysBetween("2026-08-30", "2026-09-02"), isoDaysBetween("2026-08-05", "2026-08-05"), isoDaysBetween("2026-08-05", "2026-08-04"), isoDaysBetween("junk", "2026-08-04")],
		[["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"], ["2026-08-05"], [], []]
	);
	// ---------- About's field values ----------
	eq(
		"0 and false are answers; blanks, blank lists and nothing aren't",
		[0, false, "x", ["Bob"], "", "  ", [], ["", null], null, undefined].map(isFilledField),
		[true, true, true, true, false, false, false, false, false, false]
	);
	eq(
		"a list edits as one line, a number or a yes/no as its word",
		[fieldEditText(["Bob", "Bobby"]), fieldEditText(31), fieldEditText(false), fieldEditText("Ann"), fieldEditText(undefined)],
		["Bob, Bobby", "31", "false", "Ann", ""]
	);
	eq(
		"and saves back in the shape it had",
		[
			fieldEditValue("Bob, Bobby, ", ["Bob"]),
			fieldEditValue("", ["Bob"]),
			fieldEditValue(" 32 ", 31),
			fieldEditValue("thirty", 31),
			// Emptied, not zeroed: Number("") is 0.
			fieldEditValue("", 31),
			fieldEditValue(" TRUE", false),
			fieldEditValue("maybe", false),
			fieldEditValue(" Ann ", "Ann"),
			fieldEditValue("12", undefined),
		],
		[["Bob", "Bobby"], [], 32, "thirty", "", true, "maybe", " Ann ", "12"]
	);
	return result();
}
