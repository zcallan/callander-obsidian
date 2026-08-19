import { createSuite } from "./harness.mjs";
import {
	buildTimelineDays,
	timelineRowCount,
	LONG_TIMELINE_ROWS,
} from "./.build/callander.mjs";

const at = (date, text) => ({ date, text, source: "idea" });

/**
 * Which days the itinerary shows, and how many rows that comes to — the
 * second decides whether the add buttons are repeated at the top.
 */
export function run() {
	const { eq, result } = createSuite("plan timeline");

	// ---------- buildTimelineDays ----------
	eq("nothing in, nothing out", buildTimelineDays([]), []);
	eq(
		"a day with entries appears",
		buildTimelineDays([at("2026-08-02", "A")]).map((d) => d.day),
		["2026-08-02"]
	);
	eq(
		"days sort chronologically regardless of input order",
		buildTimelineDays([at("2026-08-04", "B"), at("2026-08-02", "A")]).map(
			(d) => d.day
		),
		["2026-08-02", "2026-08-04"]
	);
	eq(
		"several entries on one day stay together",
		buildTimelineDays([at("2026-08-02", "A"), at("2026-08-02", "B")])[0]
			.entries.map((e) => e.text),
		["A", "B"]
	);
	// timelineOf has already sorted; re-sorting here would be a second
	// opinion on the same question.
	eq(
		"entry order within a day is preserved",
		buildTimelineDays([at("2026-08-02", "B"), at("2026-08-02", "A")])[0]
			.entries.map((e) => e.text),
		["B", "A"]
	);
	// The range is what makes a week-long plan read day-by-day rather than
	// skipping the quiet days.
	eq(
		"range days appear even with nothing on them",
		buildTimelineDays(
			[at("2026-08-02", "A")],
			["2026-08-01", "2026-08-02", "2026-08-03"]
		).map((d) => d.day),
		["2026-08-01", "2026-08-02", "2026-08-03"]
	);
	eq(
		"an empty range day has no entries",
		buildTimelineDays([at("2026-08-02", "A")], ["2026-08-01", "2026-08-02"])[0]
			.entries,
		[]
	);
	// A dated item outside the plan's own span still has to show up — it's
	// real, and silently hiding it would be worse than an odd-looking date.
	eq(
		"an entry outside the range is still listed",
		buildTimelineDays([at("2026-09-09", "Late")], ["2026-08-01"]).map(
			(d) => d.day
		),
		["2026-08-01", "2026-09-09"]
	);
	eq(
		"a day in both the range and the entries appears once",
		buildTimelineDays([at("2026-08-01", "A")], ["2026-08-01"]).length,
		1
	);

	// ---------- timelineRowCount ----------
	// Headings and empty-day placeholders count: each takes as much height
	// as an item, so counting only items badly under-reads a long plan.
	eq("nothing is zero rows", timelineRowCount([], 0), 0);
	eq(
		"a day with one entry is heading + row",
		timelineRowCount(buildTimelineDays([at("2026-08-02", "A")]), 0),
		2
	);
	eq(
		"an empty day still counts as heading + placeholder",
		timelineRowCount(buildTimelineDays([], ["2026-08-02"]), 0),
		2
	);
	eq(
		"two entries on a day is heading + two",
		timelineRowCount(
			buildTimelineDays([at("2026-08-02", "A"), at("2026-08-02", "B")]),
			0
		),
		3
	);
	// Undated ideas bring their own heading too.
	eq("undated adds its heading", timelineRowCount([], 2), 3);
	eq("no undated adds nothing", timelineRowCount([], 0), 0);

	// The threshold that decides whether the add row is repeated on top.
	const long = buildTimelineDays(
		[],
		Array.from({ length: 6 }, (_, i) => `2026-08-0${i + 1}`)
	);
	eq("six empty days is twelve rows", timelineRowCount(long, 0), 12);
	eq("...which is past the threshold", timelineRowCount(long, 0) > LONG_TIMELINE_ROWS, true);
	const short = buildTimelineDays([], ["2026-08-01", "2026-08-02"]);
	eq("two empty days is not", timelineRowCount(short, 0) > LONG_TIMELINE_ROWS, false);

	return result();
}
