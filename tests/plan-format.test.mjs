import { createSuite } from "./harness.mjs";
import {
	shortenMemberNames,
	shortenPeopleList,
	shortNameOverrides,
	roughTime,
	timeSortValue,
	formatQuickIdeaDates,
	parseDurationMinutes,
	formatDurationLabel,
	formatHourLabel,
	formatStayHours,
} from "./.build/callander.mjs";

/**
 * The Short Name override lets a friend's shortened/disambiguated form be
 * set explicitly ("Obama" instead of a computed "Barack" or "Barack O").
 * The interesting failure mode isn't the override itself — it's whether an
 * overridden person still silently forces a disambiguating suffix onto
 * someone else who, in the final rendered output, no longer collides with
 * anything.
 */
export function run() {
	const { eq, result } = createSuite("plan format (short names)");

	// ---------- shortenMemberNames: existing behaviour, no overrides ----------
	eq("first name alone when unique", shortenMemberNames(["Austin Philleo"]), [
		"Austin",
	]);
	eq(
		"disambiguates a real collision",
		shortenMemberNames(["Riley Sorensen", "Riley Park"]),
		["Riley S", "Riley P"]
	);
	eq(
		"a single-word name has no second word to suffix with, so stays bare",
		shortenMemberNames(["Riley", "Riley Park"]),
		["Riley", "Riley P"]
	);

	// ---------- overrides ----------
	eq(
		"override wins even with no collision at all",
		shortenMemberNames(["Barack Obama"], new Map([["barack obama", "Obama"]])),
		["Obama"]
	);
	eq(
		"override lookup is case/whitespace-insensitive",
		shortenMemberNames(
			["  BARACK obama  "],
			new Map([["barack obama", "Obama"]])
		),
		["Obama"]
	);
	eq(
		"overridden person no longer collides, so the other Barack goes bare",
		shortenMemberNames(
			["Barack Obama", "Barack Chen"],
			new Map([["barack obama", "Obama"]])
		),
		["Obama", "Barack"]
	);
	eq(
		"a real collision among the non-overridden still disambiguates",
		shortenMemberNames(
			["Barack Obama", "Barack Chen", "Barack Lee"],
			new Map([["barack obama", "Obama"]])
		),
		["Obama", "Barack C", "Barack L"]
	);
	eq(
		"unrelated names are untouched by someone else's override",
		shortenMemberNames(
			["Barack Obama", "Riley Sorensen", "Riley Park"],
			new Map([["barack obama", "Obama"]])
		),
		["Obama", "Riley S", "Riley P"]
	);

	// ---------- shortenPeopleList ----------
	eq(
		"shortenPeopleList applies the override within a people string",
		shortenPeopleList(
			"Barack Obama, Barack Chen",
			["Barack Obama", "Barack Chen"],
			"",
			new Map([["barack obama", "Obama"]])
		),
		"Obama, Barack"
	);
	eq(
		"free-hand names not on the roster still pick up an override",
		shortenPeopleList(
			"Barack Obama",
			[],
			"",
			new Map([["barack obama", "Obama"]])
		),
		"Obama"
	);
	eq(
		"\"Me\" still wins over an override for yourName's own row",
		shortenPeopleList(
			"Callan",
			["Callan"],
			"Callan",
			new Map([["callan", "Cal"]])
		),
		"Me"
	);
	eq(
		"omitting shortNames entirely behaves exactly as before",
		shortenPeopleList("Barack Obama, Barack Chen", [
			"Barack Obama",
			"Barack Chen",
		]),
		"Barack O, Barack C"
	);

	// ---------- shortNameOverrides ----------
	const map = shortNameOverrides([
		{ displayName: "Barack Obama", shortName: "Obama" },
		{ displayName: "Riley Sorensen", shortName: "" },
		{ displayName: "Laura Morton", shortName: "   " },
	]);
	eq("map size excludes blank/whitespace-only shortNames", map.size, 1);
	eq(
		"keyed by lowercased, trimmed displayName",
		map.get("barack obama"),
		"Obama"
	);
	eq("no entry for a contact without one", map.has("riley sorensen"), false);

	// ---------- "All day" ----------
	// Not a time of day but an answer to the same question, so it resolves
	// like any rough time and leads its day rather than trailing the untimed.
	eq("all-day resolves to a label", roughTime("all-day")?.label, "All day");
	eq("...and sorts to the head of the day", timeSortValue("all-day"), "00:00");
	eq(
		"...ahead of the earliest hour",
		timeSortValue("all-day") < timeSortValue("early-morning"),
		true
	);
	eq("no time still sorts last", timeSortValue(""), "99:99");
	eq("an ordinary rough time is unaffected", roughTime("dinner")?.label, "Dinner time");
	eq("nonsense is still nothing", roughTime("banana"), undefined);

	// ---------- quick idea dates: collapsing a consecutive run ----------
	eq("a single day is just that day", formatQuickIdeaDates(["2026-08-02"]), "Sun 2 Aug");
	eq(
		"two separate days join with a comma, not a range",
		formatQuickIdeaDates(["2026-08-02", "2026-08-04"]),
		"Sun 2 Aug, Tue 4 Aug"
	);
	eq(
		"a consecutive run collapses to a range",
		formatQuickIdeaDates(["2026-08-02", "2026-08-03", "2026-08-04"]),
		"Sun 2 Aug - Tue 4 Aug"
	);
	// The exact case asked for — Sunday through Wednesday. (2 Aug 2026 is a
	// Sunday, so Wednesday is the 5th, not the 7th — Aug 7 that year is a
	// Friday. The dates below are the ones that actually land on those
	// weekdays, rather than reusing the day-of-month from the request.)
	eq(
		"the reported example",
		formatQuickIdeaDates([
			"2026-08-02",
			"2026-08-03",
			"2026-08-04",
			"2026-08-05",
		]),
		"Sun 2 Aug - Wed 5 Aug"
	);
	eq(
		"order in storage doesn't matter — a click-order list still sorts first",
		formatQuickIdeaDates(["2026-08-04", "2026-08-02", "2026-08-03"]),
		"Sun 2 Aug - Tue 4 Aug"
	);
	eq(
		"a run and a separate day both appear, run first",
		formatQuickIdeaDates(["2026-08-02", "2026-08-03", "2026-08-10"]),
		"Sun 2 Aug - Mon 3 Aug, Mon 10 Aug"
	);
	eq(
		"two separate runs stay two ranges",
		formatQuickIdeaDates([
			"2026-08-02",
			"2026-08-03",
			"2026-08-10",
			"2026-08-11",
		]),
		"Sun 2 Aug - Mon 3 Aug, Mon 10 Aug - Tue 11 Aug"
	);
	eq(
		"a repeated date doesn't count as a second day in the run",
		formatQuickIdeaDates(["2026-08-02", "2026-08-02", "2026-08-03"]),
		"Sun 2 Aug - Mon 3 Aug"
	);
	// A month boundary is still just "the next day" — this only breaks if
	// adjacency were computed by comparing day-of-month numbers instead of
	// real elapsed time.
	eq(
		"a run crossing a month end stays one range",
		formatQuickIdeaDates(["2026-07-30", "2026-07-31", "2026-08-01"]),
		"Thu 30 Jul - Sat 1 Aug"
	);
	// A real US spring-forward: local midnight to local midnight here is 23
	// elapsed hours, not 24. An exact-ms adjacency check would see that as
	// "not the next day" and wrongly split the run in two.
	eq(
		"a run crossing a daylight-saving change stays one range",
		formatQuickIdeaDates(["2026-03-07", "2026-03-08", "2026-03-09"]),
		"Sat 7 Mar - Mon 9 Mar"
	);
	eq(
		"a date that won't parse is kept, not dropped",
		formatQuickIdeaDates(["2026-08-02", "not-a-date"]),
		"Sun 2 Aug, not-a-date"
	);
	eq("empty list is empty string", formatQuickIdeaDates([]), "");

	// ---------- durations ----------
	// The field was free text before it became a pair of dropdowns, so the
	// parser has to read whatever a vault already holds, not just what the
	// control now writes.
	eq("canonical hours and minutes", parseDurationMinutes("2h 30m"), 150);
	eq("hours alone", parseDurationMinutes("2h"), 120);
	eq("minutes alone", parseDurationMinutes("45m"), 45);
	eq("no space needed", parseDurationMinutes("1h15m"), 75);
	eq("case doesn't matter", parseDurationMinutes("2H 30M"), 150);
	// Legacy free text: the figure is read, the prose ignored.
	eq("a legacy '2h flight' still yields its hours", parseDurationMinutes("2h flight"), 120);
	eq("nothing recognisable is null, not zero", parseDurationMinutes("ages"), null);
	eq("empty is null", parseDurationMinutes(""), null);
	eq("undefined is null", parseDurationMinutes(undefined), null);
	// A parse landing on nothing is the same as unset — an event of zero
	// length isn't a thing worth recording.
	eq("an explicit zero reads as unset", parseDurationMinutes("0h 0m"), null);

	eq("minutes back to canonical", formatDurationLabel(150), "2h 30m");
	eq("a whole hour drops the minutes", formatDurationLabel(120), "2h");
	eq("under an hour drops the hours", formatDurationLabel(45), "45m");
	eq("zero is empty, not '0h'", formatDurationLabel(0), "");
	eq("negative is empty too", formatDurationLabel(-5), "");
	// Round-trips, which is what keeps the dropdowns showing back what was
	// saved rather than drifting a step each edit.
	eq(
		"parse and format round-trip",
		[150, 120, 45, 5].map((m) => parseDurationMinutes(formatDurationLabel(m))),
		[150, 120, 45, 5]
	);

	// ---------- hour labels ----------
	eq("midnight reads as 12am", formatHourLabel(0), "12am");
	eq("morning", formatHourLabel(8), "8am");
	eq("noon reads as 12pm, not 0pm", formatHourLabel(12), "12pm");
	eq("afternoon", formatHourLabel(15), "3pm");
	eq("last hour of the day", formatHourLabel(23), "11pm");

	// ---------- a stay's check-in / check-out ----------
	// Unset is absent rather than rendered blank; "Any time" is a real
	// answer and does show.
	eq("both set", formatStayHours("15:00", "11:00"), "Check in 3pm, 11am out");
	eq("check-in only", formatStayHours("15:00", ""), "Check in 3pm");
	eq("check-out only", formatStayHours("", "11:00"), "11am out");
	eq("neither is nothing at all", formatStayHours("", ""), "");
	eq("undefined behaves as unset", formatStayHours(undefined, undefined), "");
	// The shrug, said once rather than twice.
	eq("any at both ends collapses", formatStayHours("any", "any"), "Any time in/out");
	eq(
		"any at one end stays spelled out",
		formatStayHours("any", "11:00"),
		"Check in Any time, 11am out"
	);
	eq(
		"...and at the other",
		formatStayHours("15:00", "any"),
		"Check in 3pm, Any time out"
	);
	// "Any time" alongside an unset end is still just the one fact.
	eq("any in, nothing out", formatStayHours("any", ""), "Check in Any time");
	eq("nothing in, any out", formatStayHours("", "any"), "Any time out");
	// Midnight and noon are the two that a naive 12-hour conversion gets
	// wrong (0pm / 0am), so they're worth pinning here too.
	eq("midnight check-in", formatStayHours("00:00", ""), "Check in 12am");
	eq("noon check-out", formatStayHours("", "12:00"), "12pm out");
	// Junk can only come from hand-edited frontmatter; it reads as unset
	// rather than printing itself into the row.
	eq("an unparseable value is ignored", formatStayHours("garbage", "11:00"), "11am out");

	return result();
}
