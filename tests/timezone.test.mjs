import { createSuite } from "./harness.mjs";
import {
	allZones,
	isRegionZone,
	eventTimeOrigin,
	normalizeTimezone,
	resolveToZone,
	zoneAbbreviation,
	zoneLabel,
	zonedWallTimeToInstant,
} from "./.build/callander.mjs";

/**
 * Converting an event's time into the zone it's being read in.
 *
 * The dangerous half isn't the arithmetic, it's the **date**: a 9pm Pacific
 * game is midnight Eastern the *next day*, and the calendar cell, the week
 * heading and the sort all key off the date. So the cases that cross
 * midnight matter more than the ones that don't.
 *
 * The viewer's zone is an argument rather than something read off the
 * machine, which is the only reason any of this is testable without
 * pretending to be somewhere else.
 */
export function run() {
	const { eq, ok, result } = createSuite("timezone");

	const NY = "America/New_York";
	const CHI = "America/Chicago";
	const LA = "America/Los_Angeles";

	// ---------- the ordinary case ----------
	eq(
		"12pm Central reads 1pm Eastern",
		resolveToZone("2026-10-22", "12:00", CHI, NY),
		{ date: "2026-10-22", time: "13:00" }
	);

	// ---------- the case the whole design is built around ----------
	// Converting the time without moving the day would put this event in
	// the wrong calendar square, under the wrong week heading, in the wrong
	// place in the sort — and it would look plausible while doing it.
	eq(
		"9pm Pacific is the NEXT day in Eastern",
		resolveToZone("2026-01-05", "21:00", LA, NY),
		{ date: "2026-01-06", time: "00:00" }
	);
	eq(
		"1am Eastern is the PREVIOUS day in Pacific",
		resolveToZone("2026-01-06", "01:00", NY, LA),
		{ date: "2026-01-05", time: "22:00" }
	);

	// ---------- daylight saving ----------
	// Read off Intl rather than a fixed offset table, so a zone that moves
	// its clocks on a different date from the viewer's still lands right.
	eq(
		"the gap holds in summer too",
		resolveToZone("2026-07-15", "12:00", CHI, NY),
		{ date: "2026-07-15", time: "13:00" }
	);
	eq(
		"zones whose DST disagrees in November",
		// The US has fallen back; Sydney is on summer time.
		resolveToZone("2026-11-10", "09:00", NY, "Australia/Sydney"),
		{ date: "2026-11-11", time: "01:00" }
	);
	eq("winter abbreviates CST", zoneAbbreviation("2026-01-15", CHI), "CST");
	eq("summer abbreviates CDT", zoneAbbreviation("2026-07-15", CHI), "CDT");

	// The offset has to be looked up twice — the first guess reads the
	// wall time as if it were UTC, which on a transition day lands on the
	// wrong side of the jump. This input is where one pass and two
	// disagree: one gives 07:30Z, two give 06:30Z.
	eq(
		"the offset is settled, not guessed once",
		zonedWallTimeToInstant("2026-03-08", "02:30", NY)?.toISOString(),
		"2026-03-08T06:30:00.000Z"
	);
	eq(
		"an ordinary time on a transition day is unaffected",
		zonedWallTimeToInstant("2026-03-08", "12:00", NY)?.toISOString(),
		"2026-03-08T16:00:00.000Z"
	);

	// ---------- the guards ----------
	// Each of these is a reason NOT to convert, and each matters as much as
	// the conversion: between them they're every event that existed before
	// any of this, which must come through untouched.
	const untouched = { date: "2026-10-22", time: "12:00" };
	eq(
		"no zone is a floating time",
		resolveToZone("2026-10-22", "12:00", "", NY),
		untouched
	);
	// Converting a zone into itself would be a no-op anyway; the guard is
	// there to skip the work, and eventTimeOrigin below is where the same
	// question has a visible answer.
	eq(
		"already in the viewer's zone",
		resolveToZone("2026-10-22", "12:00", NY, NY),
		untouched
	);
	eq(
		"a zone Intl doesn't know",
		resolveToZone("2026-10-22", "12:00", "Mars/Olympus", NY),
		untouched
	);
	eq(
		"'tbd' has no clock to move",
		resolveToZone("2026-10-22", "tbd", CHI, NY),
		{ date: "2026-10-22", time: "tbd" }
	);
	eq(
		"'anytime' likewise",
		resolveToZone("2026-10-22", "anytime", CHI, NY),
		{ date: "2026-10-22", time: "anytime" }
	);
	eq(
		"a month-precision date has no day to anchor to",
		resolveToZone("2026-10", "12:00", CHI, NY),
		{ date: "2026-10", time: "12:00" }
	);
	eq(
		"an undated event likewise",
		resolveToZone("", "12:00", CHI, NY),
		{ date: "", time: "12:00" }
	);

	// ---------- zones as they arrive from a spreadsheet ----------
	eq("an abbreviation", normalizeTimezone("CT"), CHI);
	eq("...cased however", normalizeTimezone("ct"), CHI);
	eq("a season-specific one", normalizeTimezone("EDT"), NY);
	eq("a plain name", normalizeTimezone("Pacific"), LA);
	eq("an IANA id Intl knows", normalizeTimezone("Europe/Madrid"), "Europe/Madrid");
	eq("empty means floating", normalizeTimezone(""), "");
	eq("anything else is refused", normalizeTimezone("somewhere"), null);

	// ---------- the marker that keeps a converted time honest ----------
	// A bare "1:00 PM" on a game entered as 12pm CT is indistinguishable
	// from a typo, so the original rides along wherever the time is shown.
	const zoned = {
		sourceDate: "2026-10-22",
		sourceTime: "12:00",
		timezone: CHI,
	};
	// October is still daylight time in the US — the abbreviation is read
	// off the event's own date rather than assumed.
	eq("says where a converted time came from", eventTimeOrigin(zoned, NY), "12pm CDT");
	eq(
		"and nothing when it wasn't converted",
		eventTimeOrigin(zoned, CHI),
		""
	);
	// The picker offers one zone per group of zones keeping identical
	// time, so a stored id can differ from the reader's while the clock
	// doesn't. Nothing moved, so nothing is explained.
	eq(
		"nor when a different zone keeps the same time",
		eventTimeOrigin(
			{ sourceDate: "2026-10-22", sourceTime: "12:00", timezone: "Europe/Paris" },
			"Europe/Madrid"
		),
		""
	);
	eq(
		"nor for a floating time",
		eventTimeOrigin({ ...zoned, timezone: "" }, NY),
		""
	);
	eq(
		"nor when there's no clock to have converted",
		eventTimeOrigin({ ...zoned, sourceTime: "tbd" }, NY),
		""
	);
	eq(
		"...and says CST once the clocks go back",
		eventTimeOrigin({ ...zoned, sourceDate: "2026-12-10" }, NY),
		"12pm CST"
	);

	// ---------- the grouped list under the short one ----------
	// Intl lists ~418 zones, most of which keep identical time — 33 of
	// them are western Europe. Collapsing them to the ones that actually
	// behave differently is what keeps the dropdown scannable.
	const all = allZones();
	ok("far shorter than Intl's raw list", all.length < 100);
	ok("...but not so short it lost zones", all.length > 30);
	// Fixed width, always signed, always padded — a column of these lines
	// up in a dropdown instead of fraying.
	ok(
		"every entry leads with a padded offset",
		all.every((z) => /^\([+-]\d{2}:\d{2}\) \S/.test(z.label))
	);
	ok("every entry is a real region", all.every((z) => isRegionZone(z.id)));

	// Tested on the rule rather than on the list: which of these an Intl
	// build emits depends on its ICU version, so asserting "none turned
	// up" passes for the wrong reason on a runtime that never emits any.
	// Obsidian's does — hence "(-10:00) GMT+10", an offset masquerading as
	// a city, with the sign the other way round from the one it means.
	eq("a real city is a region", isRegionZone("America/New_York"), true);
	eq("a pseudo-zone is not", isRegionZone("Etc/GMT+10"), false);
	eq("nor a legacy alias", isRegionZone("US/Pacific"), false);
	eq("nor a bare name", isRegionZone("Japan"), false);
	eq("nor UTC itself", isRegionZone("UTC"), false);
	ok(
		"every entry stores a zone Intl knows",
		all.every((z) => resolveToZone("2026-06-15", "12:00", z.id, "UTC").time !== "")
	);
	// The collapse itself: western Europe keeps one clock, so it earns one
	// row rather than thirty-three. Whichever city represents it, the
	// others must not also be listed.
	const westEurope = all.filter((z) =>
		["Europe/Paris", "Europe/Madrid", "Europe/Berlin", "Europe/Rome"].includes(
			z.id
		)
	);
	eq("zones keeping identical time share one row", westEurope.length, 1);
	ok(
		"...and that row names several of them, comma separated",
		/\) \w[\w ]*, \w/.test(westEurope[0]?.label ?? "")
	);
	ok(
		"...without tallying the ones it left out",
		!/\+\d+\s*$/.test(westEurope[0]?.label ?? "")
	);
	// The collapse must not go further than that. New York and Puerto Rico
	// read the same clock today and part company every winter, when only
	// one of them changes. Merged, half the year's events would convert an
	// hour out — which is why the grouping probes a whole year, not now.
	const ny = all.find((z) => z.id === "America/New_York");
	const pr = all.find((z) => z.id === "America/Puerto_Rico");
	ok("a DST zone keeps its own row", !!ny);
	ok("...apart from the fixed-offset one beside it", !!pr && pr.id !== ny?.id);
	// And the row is named after the city people will recognise, not
	// whichever one sorts first — that would make this Anguilla.
	ok("named after a notable city", ny?.label.includes("New York"));
	// Ordered by offset, so scrolling to "about six hours behind" works
	// without knowing which city to look for.
	const offsets = all.map((z) =>
		Number(/^\(([+-]\d{1,2})/.exec(z.label)?.[1])
	);
	eq(
		"ordered by offset",
		offsets.every((n, i) => i === 0 || offsets[i - 1] <= n),
		true
	);
	// Not by name: which alias Intl reports for a given zone (Kolkata vs
	// Calcutta) depends on the ICU build, and that isn't what's under test.
	ok(
		"a half-hour zone keeps its minutes",
		all.some((z) => /^\([+-]\d{2}:30\) /.test(z.label))
	);
	eq("built once and kept", allZones(), all);

	// ---------- labels ----------
	eq("a curated zone uses its short name", zoneLabel(CHI), "Central");
	eq(
		"one off the list falls back to its city",
		zoneLabel("Europe/Madrid"),
		"Madrid"
	);

	return result();
}
