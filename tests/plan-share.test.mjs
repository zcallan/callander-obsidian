import { createSuite } from "./harness.mjs";
import {
	buildPlanShareText,
	buildTimelineCalendarUrl,
	formatPlanDateRange,
	PLAN_SHARE_DETAIL_DEFAULTS,
} from "./.build/callander.mjs";

/**
 * "Copy as text" produces a message you paste to friends, so the failure
 * mode is social rather than technical: a full name where a first name
 * belongs, "Me" in a message someone else reads, or a raw YAML shape
 * leaking through as "[object Object]".
 */
export function run() {
	const { eq, ok, result } = createSuite("plan share text");

	const opts = {
		yourName: "Callan",
		members: ["Riley Sorensen", "Laura Morton"],
		unconfirmed: ["Harry Mayer"],
	};

	const clone = () => structuredClone(PLAN_SHARE_DETAIL_DEFAULTS);
	/** Per-item people, which is off at the master by default. */
	const withPeople = () => {
		const d = clone();
		d.general.people = true;
		return d;
	};

	// ---------- date ranges ----------
	// Months are always three letters. en-AU's `month: "short"` leaves
	// June/July/Sept longer, so these guard against that leaking back in —
	// a trip must never read "Thu 30 July - Sun 2 Aug".
	eq(
		"collapses to one date when there's no range",
		formatPlanDateRange("2026-07-30", undefined),
		"Thu 30 Jul"
	);
	eq(
		"renders a range",
		formatPlanDateRange("2026-07-30", "2026-08-02"),
		"Thu 30 Jul - Sun 2 Aug"
	);
	eq(
		"June is shortened, not left long",
		formatPlanDateRange("2026-06-01", undefined),
		"Mon 1 Jun"
	);
	eq(
		"September is shortened, not left as Sept",
		formatPlanDateRange("2026-09-01", undefined),
		"Tue 1 Sep"
	);
	eq(
		"a month pair the locale already abbreviates is unchanged",
		formatPlanDateRange("2026-03-30", "2026-04-02"),
		"Mon 30 Mar - Thu 2 Apr"
	);
	eq(
		"same start and end collapses",
		formatPlanDateRange("2026-07-30", "2026-07-30"),
		"Thu 30 Jul"
	);
	eq("no date -> empty", formatPlanDateRange(undefined, undefined), "");

	// ---------- names ----------
	{
		const out = buildPlanShareText(
			{
				name: "Ridge trip",
				date: "2026-07-30",
				items: [
					{
						text: "Lobster roll",
						category: "restaurant",
						date: "2026-07-30",
						time: "19:00",
						people: "Callan, Riley Sorensen, Laura Morton",
					},
				],
			},
			{ ...opts, detail: withPeople() }
		);
		ok("includes the plan name", out.includes("Ridge trip"));
		// Bullet lines only. The overview repeats the same names, so matching
		// the whole message would pass even with per-item people switched off
		// entirely — which is exactly how this assertion went stale once.
		const itemLines = out
			.split("\n")
			.filter((l) => l.startsWith("- "))
			.join("\n");
		ok(
			"per-item people are shortened to first names",
			itemLines.includes("Callan, Riley, Laura")
		);
		ok(
			"never says 'Me' — this is for other people to read",
			!/\bMe\b/.test(out)
		);
		ok("your name still appears", out.includes("Callan"));
	}

	// Two people sharing a first name must stay distinguishable, and
	// consistently so across the header and the item lines.
	{
		const out = buildPlanShareText(
			{
				name: "Trip",
				items: [
					{
						text: "Dinner",
						category: "restaurant",
						date: "2026-07-30",
						people: "Riley Sorensen",
					},
				],
			},
			{
				yourName: "Callan",
				members: ["Riley Sorensen", "Riley Baker"],
				unconfirmed: [],
				detail: withPeople(),
			}
		);
		ok("duplicate first names disambiguate", out.includes("Riley S"));
		ok("...and the other one too", out.includes("Riley B"));
		ok(
			"...on the item line, not just the header",
			out.split("\n").some((l) => l.startsWith("- ") && l.includes("Riley S"))
		);
	}

	// ---------- hostile frontmatter shapes ----------
	{
		// `name` and `location` come from user-editable YAML, so they can be
		// any shape at all.
		const out = buildPlanShareText(
			{ name: { unexpected: "map" }, location: ["a", "list"] },
			{ yourName: "", members: [], unconfirmed: [] }
		);
		ok("a map name never renders as [object Object]", !out.includes("[object Object]"));
		ok("a list location never renders as [object Object]", !out.includes("[object Object]"));
	}

	// ---------- undated sections still appear ----------
	{
		const withPeopleAndCosts = () => {
			const d = withPeople();
			d.general.costs = true;
			return d;
		};
		const out = buildPlanShareText(
			{
				name: "Trip",
				travel: [
					{
						text: "Ferry",
						type: "boat",
						people: "Riley Sorensen",
						cost: 25,
					},
				],
				accommodation: [
					{ text: "Cabin", stay: "camping", nights: 3, cost: 90 },
				],
				items: [
					{ text: "Museum", category: "activity", priority: "must" },
					{ text: "Maybe a swim", category: "activity" },
				],
				bring: [{ text: "Towels", done: false }],
			},
			{ ...opts, detail: withPeopleAndCosts() }
		);
		ok("undated travel is listed", out.includes("Ferry"));
		ok(
			"undated travel people are shortened",
			out.split("\n").some((l) => l.startsWith("- ") && l.includes("Ferry") && l.includes("Riley"))
		);
		ok("undated stays are listed", out.includes("Cabin"));
		ok("must-do ideas are listed", out.includes("Museum"));
		ok("maybes are marked", out.includes("(if there's time)"));
		ok("bring list is included", out.includes("Towels"));

		// The other two call sites that strip 💵 — dated items are covered
		// in the detail-toggles block below, these are the undated ones.
		ok("undated travel cost shows with no emoji", out.includes("$25"));
		ok("undated stay cost shows with no emoji", out.includes("$90"));
		ok("no 💵 anywhere in the undated sections", !out.includes("\u{1F4B5}"));
	}

	// ---------- detail toggles ----------
	// Four groups, and General acts as a master over the other three.
	//
	// Notes/People/Costs/Address now all start OFF at the General master,
	// while the per-kind boxes underneath stay ON (greyed, not unticked) —
	// so one tick on a General box reveals that detail across every kind at
	// once, and any single kind can still opt back out from its own box.
	// Overview and Emojis are unaffected: they have no per-kind counterpart
	// and remain on by default.
	{
		const data = {
			name: "Ridge trip",
			date: "2026-07-30",
			// Three-day span with items on the first day only, so the
			// empty-dates toggle has something to reveal.
			endDate: "2026-08-01",
			location: "Byron Bay",
			items: [
				{
					text: "\u{1F99E} Lobster roll",
					category: "restaurant",
					date: "2026-07-30",
					time: "19:00",
					people: "Riley Sorensen",
					cost: 40,
					notes: "Book ahead",
					location: "Main St",
				},
			],
			travel: [
				{
					text: "Ferry",
					type: "boat",
					date: "2026-07-30",
					time: "09:00",
					people: "Laura Morton",
					cost: 60,
					notes: "Gate 4",
				},
			],
			accommodation: [
				{
					text: "Cabin",
					stay: "camping",
					date: "2026-07-30",
					nights: 2,
					people: "Harry Mayer",
					cost: 220,
					address: "12 Pine Rd",
					notes: "Key in lockbox",
				},
			],
		};
		// `mutate` receives a fresh default detail to adjust.
		const build = (mutate = () => {}) => {
			const d = clone();
			mutate(d);
			return buildPlanShareText(data, { ...opts, detail: d });
		};
		// Every General master on — the "if I tick everything" case, and the
		// baseline the per-field "on" assertions build from.
		const allOn = (d) => {
			d.general.notes = true;
			d.general.people = true;
			d.general.costs = true;
			d.general.address = true;
		};
		const full = build(allOn);
		// The untouched defaults — every per-kind detail off, since its
		// master is off, regardless of what the per-kind box itself says.
		const bare = build();

		// Bullet lines only — the overview repeats names and dates, so
		// matching the whole message would pass even with a detail fully off.
		const bullets = (text) =>
			text
				.split("\n")
				.filter((l) => l.startsWith("- ") || l.startsWith("  "))
				.join("\n");

		// ---- General-only options (unaffected by this change) ----
		ok("overview carries the name", full.includes("Ridge trip"));
		ok("...the dates", full.includes("Thu 30 Jul"));
		ok("...the location", full.includes("Byron Bay"));
		const noOverview = build((d) => {
			allOn(d);
			d.overview = false;
		});
		ok("overview off drops the name", !noOverview.includes("Ridge trip"));
		ok("...and the location", !noOverview.includes("Byron Bay"));
		ok("...but keeps the itinerary", noOverview.includes("Lobster roll"));
		ok(
			"...and never starts on a blank line",
			noOverview.split("\n")[0].trim() !== ""
		);

		// 📍 needs Address on to appear at all now, so the marker for "emojis
		// are on by default" has to be something present with everything else
		// off too — the item's own leading emoji survives being copied.
		ok("emojis are on by default", bare.includes("\u{1F99E}"));
		const noEmoji = build((d) => (d.emojis = false));
		ok(
			"emojis off leaves none at all",
			!/\p{Extended_Pictographic}/u.test(noEmoji)
		);
		ok("...but keeps the text that carried one", noEmoji.includes("Lobster roll"));

		// ---- costs never carry an emoji, even with Emojis on ----
		// Asked for explicitly: a dollar figure reads as money on its own,
		// so it's excluded from the Emojis toggle rather than following it.
		ok("a dated idea's cost has no emoji before it", bullets(full).includes("$40") && !bullets(full).includes("\u{1F4B5} $40"));
		ok("...same for travel", bullets(full).includes("$60") && !bullets(full).includes("\u{1F4B5} $60"));
		ok("...same for a stay", bullets(full).includes("$220") && !bullets(full).includes("\u{1F4B5} $220"));
		ok(
			"no 💵 appears anywhere, even with every cost showing",
			!full.includes("\u{1F4B5}")
		);

		// ---- empty dates ----
		// The plan spans Thu 30 Jul - Sat 1 Aug; only the 30th has anything.
		const dayHeadings = (text) =>
			text.split("\n").filter((l) => /^\w+day \d/.test(l));
		eq(
			"only days with something on them appear by default",
			dayHeadings(bare).length,
			1
		);
		const withEmpty = build((d) => (d.emptyDates = true));
		eq(
			"empty dates on prints every day the plan spans",
			dayHeadings(withEmpty).length,
			3
		);
		ok(
			"...in order",
			dayHeadings(withEmpty).join("|").indexOf("30 July") <
				dayHeadings(withEmpty).join("|").indexOf("1 August")
		);
		// A day-precise range is required; a vague one must not invent days.
		const vague = buildPlanShareText(
			{ ...data, date: "2026-07", endDate: undefined },
			{
				...opts,
				detail: (() => {
					const d = clone();
					d.emptyDates = true;
					return d;
				})(),
			}
		);
		eq("a month-only plan date adds no empty days", dayHeadings(vague).length, 1);

		// ---- notes: off by default, on with the master, per-kind override ----
		ok("idea notes are off by default", !bare.includes("Book ahead"));
		ok("travel notes too", !bare.includes("Gate 4"));
		ok("accom notes too", !bare.includes("Key in lockbox"));

		const notesOn = build((d) => (d.general.notes = true));
		ok("General notes on reveals ideas", notesOn.includes("Book ahead"));
		ok("...travel", notesOn.includes("Gate 4"));
		ok("...and accommodation", notesOn.includes("Key in lockbox"));

		const ideaNotesOff = build((d) => {
			d.general.notes = true;
			d.idea.notes = false;
		});
		ok(
			"one kind can opt out while the master is on",
			!ideaNotesOff.includes("Book ahead") && ideaNotesOff.includes("Gate 4")
		);

		// ---- address: an idea's location, a stay's address ----
		// (Travel has an Address box too, but travel items can't hold an
		// address today, so there is nothing for it to gate.)
		ok("an idea's location is off by default", !bare.includes("Main St"));
		ok("a stay's address too", !bare.includes("12 Pine Rd"));
		const addressOn = build((d) => (d.general.address = true));
		ok("General address on reveals the idea's location", addressOn.includes("Main St"));
		ok("...and the stay's address", addressOn.includes("12 Pine Rd"));
		const stayAddrOff = build((d) => {
			d.general.address = true;
			d.accommodation.address = false;
		});
		ok(
			"the stay can opt out while the idea still shows",
			!stayAddrOff.includes("12 Pine Rd") && stayAddrOff.includes("Main St")
		);

		// ---- costs ----
		ok("costs are off by default", !bare.includes("$40"));
		ok("...for travel", !bare.includes("$60"));
		ok("...and stays", !bare.includes("$220"));
		const costsOn = build((d) => (d.general.costs = true));
		ok("General costs on reveals every kind", costsOn.includes("$40") && costsOn.includes("$60") && costsOn.includes("$220"));
		const ideaCostOff = build((d) => {
			d.general.costs = true;
			d.idea.costs = false;
		});
		ok("idea costs can opt out while travel shows", !ideaCostOff.includes("$40") && ideaCostOff.includes("$60"));

		// ---- people ----
		ok(
			"per-item people are off at the master by default",
			!bullets(bare).includes("Laura")
		);
		const peopleOn = build((d) => (d.general.people = true));
		ok("...and appear once the master is on", bullets(peopleOn).includes("Laura"));
		ok(
			"...on every kind",
			bullets(peopleOn).includes("Harry") && bullets(peopleOn).includes("Riley")
		);
		const ideaPeopleOff = build((d) => {
			d.general.people = true;
			d.idea.people = false;
		});
		ok(
			"one kind can opt out while the master is on",
			!bullets(ideaPeopleOff).includes("Riley") &&
				bullets(ideaPeopleOff).includes("Laura")
		);

		// ---- the master wins even while a per-kind box is ticked ----
		// This is the exact state the modal leaves the per-kind boxes in when
		// it greys them out: still true underneath, just disabled. Output has
		// to ignore them regardless, or a greyed "on" box would silently leak
		// through.
		const masterOffBoxesOn = build((d) => {
			d.idea.notes = true;
			d.travel.notes = true;
			d.accommodation.notes = true;
		});
		eq(
			"a ticked per-kind box cannot override an off master",
			masterOffBoxesOn,
			bare
		);

		// ---- turning the master back off restores what was ticked ----
		const toggledBackOff = build((d) => {
			d.general.notes = true;
			d.general.notes = false;
			d.travel.notes = false;
		});
		const backOn = build((d) => {
			d.general.notes = true;
			// travel.notes was turned off above and stays off — the whole
			// point is that the per-kind state survives the master flipping.
			d.travel.notes = false;
		});
		ok("master back on respects the per-kind boxes", backOn.includes("Book ahead"));
		ok("...including one switched off", !backOn.includes("Gate 4"));
		ok(
			"...and toggling the master off again changes nothing further",
			toggledBackOff === bare
		);
	}

	// ---------- buildTimelineCalendarUrl ----------
	// Parsed back with `URL` rather than string-compared, so the assertions
	// check the values that survive encoding rather than one exact escaping.
	{
		const entry = (over = {}) => ({
			source: "idea",
			index: 0,
			date: "2026-08-08",
			text: "Lobster roll",
			emoji: "\u{1F355}",
			...over,
		});
		const dates = (over) => {
			const url = buildTimelineCalendarUrl(entry(over));
			return url ? new URL(url).searchParams.get("dates") : null;
		};
		const param = (over, key) => {
			const url = buildTimelineCalendarUrl(entry(over));
			return url ? new URL(url).searchParams.get(key) : null;
		};

		eq("no date at all: nowhere to send it", buildTimelineCalendarUrl(entry({ date: "" })), null);
		eq(
			"an unparseable date likewise",
			buildTimelineCalendarUrl(entry({ date: "sometime" })),
			null
		);

		// ---- idea / travel: duration decides the end ----
		eq(
			"an untimed idea is a whole day, end exclusive",
			dates({}),
			"20260808/20260809"
		);
		// The stated default: an hour when nothing says otherwise.
		eq(
			"a timed idea with no duration runs an hour",
			dates({ time: "19:00" }),
			"20260808T190000/20260808T200000"
		);
		eq(
			"...and honours a duration when it has one",
			dates({ time: "19:00", duration: "1h 30m" }),
			"20260808T190000/20260808T203000"
		);
		eq(
			"a minutes-only duration works too",
			dates({ time: "19:00", duration: "45m" }),
			"20260808T190000/20260808T194500"
		);
		// Real time arithmetic, not string padding — this is the case that
		// would produce a nonsense "T250000" if the hour were just incremented.
		eq(
			"a duration running past midnight rolls onto the next day",
			dates({ time: "23:30", duration: "1h 30m" }),
			"20260808T233000/20260809T010000"
		);
		eq(
			"travel behaves the same as an idea",
			dates({ source: "travel", time: "09:00", duration: "2h" }),
			"20260808T090000/20260808T110000"
		);

		// ---- accommodation: nights, and check-in/out when set ----
		eq(
			"a stay with no hours is all-day across its nights, end exclusive",
			dates({ source: "accommodation", nights: 3 }),
			"20260808/20260811"
		);
		eq(
			"a stay with no nights at all still covers one day",
			dates({ source: "accommodation" }),
			"20260808/20260809"
		);
		eq(
			"check-in and check-out give it real hours",
			dates({
				source: "accommodation",
				nights: 2,
				checkIn: "15:00",
				checkOut: "10:00",
			}),
			"20260808T150000/20260810T100000"
		);
		// Both are needed to make it timed — one alone can't bound a stay,
		// so it stays all-day rather than inventing the other end.
		eq(
			"check-in alone leaves it all-day",
			dates({ source: "accommodation", nights: 2, checkIn: "15:00" }),
			"20260808/20260810"
		);
		eq(
			"check-out alone likewise",
			dates({ source: "accommodation", nights: 2, checkOut: "10:00" }),
			"20260808/20260810"
		);

		// ---- title, notes, place ----
		eq(
			"the row's emoji leads the title",
			param({}, "text"),
			"\u{1F355} Lobster roll"
		);
		eq(
			"...unless the text already brings one",
			param({ text: "\u{1F389} Party" }, "text"),
			"\u{1F389} Party"
		);
		eq("notes become the details", param({ notes: "Book ahead" }, "details"), "Book ahead");
		eq("an idea's location is the place", param({ location: "Main St" }, "location"), "Main St");
		eq(
			"a stay's address is the place",
			param({ source: "accommodation", address: "12 Pine Rd" }, "location"),
			"12 Pine Rd"
		);
		eq(
			"nothing optional is sent when nothing is set",
			[param({}, "details"), param({}, "location")],
			[null, null]
		);
		// Floating, not UTC — same reasoning as the event modal's link.
		eq(
			"timed rows carry no UTC marker",
			dates({ time: "19:00" }).includes("Z"),
			false
		);
	}

	return result();
}
