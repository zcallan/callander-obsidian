import { createSuite } from "./harness.mjs";
import {
	parseFlexDate,
	isFlexUpcoming,
	isFlexWithinLastMonths,
	formatRelativeFlex,
	formatShortFlexDate,
	resolveSpan,
} from "./.build/callander.mjs";

/**
 * The recent-past window behind the glance modal's "Last 12 months".
 *
 * It has to agree with isFlexUpcoming at the boundary — anything the two
 * both claim would be listed twice, anything neither claims vanishes from
 * the modal entirely — so the pair is tested together against one fixed
 * `now` rather than each on its own.
 */
export function run() {
	const { eq, ok, result } = createSuite("flexdate windows");

	// Mid-month, mid-year, so no case sits on a month or year boundary
	// by accident.
	const now = new Date(2026, 7, 5); // 5 August 2026
	const within = (iso, months = 12) =>
		isFlexWithinLastMonths(parseFlexDate(iso), months, now);
	const upcoming = (iso) => isFlexUpcoming(parseFlexDate(iso), now);

	// ---------- the plain cases ----------
	ok("last month is inside the window", within("2026-07-04"));
	ok("this time last year is not", !within("2025-08-04"));
	ok("just inside a year ago is", within("2025-08-06"));
	ok("years back is well outside", !within("2019-03-14"));

	// ---------- the boundary with isFlexUpcoming ----------
	ok("a future date is not 'recent'", !within("2026-12-25"));
	ok("...and it is upcoming", upcoming("2026-12-25"));
	ok("today is not upcoming-only — it counts as recent", !upcoming("2026-08-04"));
	// Every dated thing must land in exactly one of the two lists, or it
	// is either duplicated in the modal or missing from it.
	for (const iso of [
		"2026-08-05",
		"2026-08-04",
		"2026-08-06",
		"2026-01-01",
		"2025-09-01",
		"2027-01-01",
		"2026-08",
		"2026",
	]) {
		const inRecent = within(iso);
		const inUpcoming = upcoming(iso);
		ok(
			`${iso}: never in both lists at once`,
			!(inRecent && inUpcoming)
		);
	}

	// ---------- coarse dates ----------
	// A bare year is read from 1 January, so "2026" counts as recent all
	// year but "2025" has already fallen out by August 2026.
	ok("a bare current year is recent", within("2026"));
	ok("a bare year 19 months back is not", !within("2025"));
	ok(
		"a month-precision date inside the window counts",
		within("2026-03")
	);
	ok(
		"the current month reads as upcoming, not recent",
		!within("2026-08") && upcoming("2026-08")
	);

	// ---------- unusable input ----------
	// A year-less birthday ("08-04") parses fine but can't be placed on a
	// timeline, so it belongs to neither list.
	eq("a year-less date has no window", within("08-04"), false);
	eq("...nor is it upcoming", upcoming("08-04"), false);

	// ---------- the window is actually the window ----------
	ok("3-month window excludes a 6-month-old date", !within("2026-02-04", 3));
	ok("...and includes a 1-month-old one", within("2026-07-04", 3));

	// ---------- formatRelativeFlex ----------
	const rel = (iso) => formatRelativeFlex(parseFlexDate(iso), now);

	eq("today", rel("2026-08-05"), "today");
	eq("tomorrow", rel("2026-08-06"), "tomorrow");
	eq("yesterday", rel("2026-08-04"), "yesterday");
	eq("a few days back", rel("2026-07-30"), "6 days ago");
	eq("a few days ahead", rel("2026-08-15"), "in 10 days");
	// Past a month, days stop being the useful unit.
	eq("six weeks back rounds to months", rel("2026-06-20"), "2 months ago");
	eq("five weeks ahead rounds to months", rel("2026-09-11"), "in 1 month");
	eq("a year and a half back", rel("2025-01-05"), "2 years ago");

	// A singular unit must not read "1 days ago".
	eq("singular day", rel("2026-09-04"), "in 30 days");
	eq("singular month reads singular", rel("2026-06-25"), "1 month ago");

	// The .5 rounding boundary: JS rounds -1.5 towards zero and 1.5 away,
	// so a naive Math.round would call 45 days back "1 month" and 45 days
	// ahead "2 months". Equal distances must read equal.
	eq(
		"45 days back and 45 ahead are the same distance",
		rel("2026-06-21").replace(" ago", ""),
		rel("2026-09-19").replace("in ", "")
	);

	// Coarse dates never invent a day count.
	eq("a month back", rel("2026-06"), "2 months ago");
	eq("this month", rel("2026-08"), "this month");
	eq("this year", rel("2026"), "this year");
	eq("a bare year back", rel("2024"), "2 years ago");
	eq("no year, no distance", rel("08-04"), "");

	// ---------- resolveSpan ----------
	// A plan covers a span, so which of its two dates speaks for it
	// depends on where that span sits relative to today.
	const span = (startIso, endIso) =>
		resolveSpan(parseFlexDate(startIso), parseFlexDate(endIso), now);

	{
		// Wholly past, with an exact end: the END is what "ago" measures.
		// This is the whole point — a trip that ran 26-30 July finished
		// 6 days ago, not 10.
		const s = span("2026-07-26", "2026-07-30");
		ok("a finished trip is past", s.past);
		ok("...and is not underway", !s.underway);
		eq("...and speaks from its end date", formatRelativeFlex(s.date, now), "6 days ago");
		eq(
			"the start date would have said something else",
			formatRelativeFlex(parseFlexDate("2026-07-26"), now),
			"10 days ago"
		);
	}
	{
		// Wholly ahead: the START is what you want — when it begins.
		const s = span("2026-09-11", "2026-09-14");
		ok("a future trip is not past", !s.past);
		eq("...and speaks from its start", formatRelativeFlex(s.date, now), "in 1 month");
	}
	{
		// Started but not finished — the case that would otherwise read
		// "3 days ago" under a heading saying Upcoming.
		const s = span("2026-08-02", "2026-08-09");
		ok("a trip you're on is not past", !s.past);
		ok("...and is flagged underway", s.underway);
	}
	{
		// No end date at all: the start does both jobs, exactly as before.
		const s = span("2026-07-26", "");
		ok("without an end date a past start is past", s.past);
		ok("...and is never underway", !s.underway);
		eq("...and speaks from the start", formatRelativeFlex(s.date, now), "10 days ago");
	}
	{
		// A month-precision end can't say whether the span has finished,
		// so it must not be trusted to.
		const s = span("2026-07-26", "2026-08");
		eq(
			"a coarse end date is ignored in favour of the start",
			formatRelativeFlex(s.date, now),
			"10 days ago"
		);
		ok("...and doesn't fake an underway span", !s.underway);
	}
	{
		// The invariant the two lists depend on: `past` decides both which
		// list a plan lands in AND which date labels it, so a plan can
		// never appear twice nor fall through the gap.
		const cases = [
			["2026-07-26", "2026-07-30"],
			["2026-09-11", "2026-09-14"],
			["2026-08-02", "2026-08-09"],
			["2026-08-05", "2026-08-05"],
			["2026-07-26", ""],
			["2026-09-11", ""],
			["2026-07-26", "2026-08"],
			["2026", ""],
		];
		for (const [start, end] of cases) {
			const s = span(start, end);
			const inUpcoming = !s.past;
			const inRecent = s.past;
			ok(
				`${start}..${end || "—"}: lands in exactly one list`,
				inUpcoming !== inRecent
			);
		}
	}

	// ---------- formatShortFlexDate ----------
	const short = (iso) => formatShortFlexDate(parseFlexDate(iso));

	eq("full date is day-first", short("1997-11-28"), "28 Nov 1997");
	eq("a year-less birthday drops the year", short("11-28"), "28 Nov");
	eq("month precision", short("1997-11"), "Nov 1997");
	eq("year only", short("1997"), "1997");
	// Single-digit days stay unpadded, matching how the app writes dates
	// elsewhere ("2 Aug", not "02 Aug").
	eq("no zero padding", short("2025-08-02"), "2 Aug 2025");
	eq("December abbreviates to three letters", short("2025-12-25"), "25 Dec 2025");

	return result();
}
