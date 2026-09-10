import { createSuite } from "./harness.mjs";
import { STAY_SHARE_DEFAULTS, buildStayShareText } from "./.build/callander.mjs";

const STAYS = [
	{
		text: "The Notch House",
		// Thursday 17 September 2026; three nights lands on the Sunday.
		date: "2026-09-17",
		nights: 3,
		checkIn: "16:00",
		checkOut: "10:00",
		address: "14 Profile Road, Franconia, NH",
		notes: "Key in the lockbox — code 4417.",
		people: "Callan, Cormac",
		cost: 340,
		booked: "booked",
	},
	// The sparse case: a name and nothing else agreed yet. No date, so it
	// trails the dated one however the list is stored.
	{ text: "Backup near Lincoln", booked: "todo" },
];

const detail = (over = {}) => ({ ...STAY_SHARE_DEFAULTS, ...over });
const build = (over, stays = STAYS) => buildStayShareText(stays, detail(over));

/**
 * Where you're staying, as text you can paste to whoever is driving.
 *
 * The rule that matters: a toggle changes exactly the line it names, and a
 * stay with nothing recorded still says its own name.
 */
export function run() {
	const { eq, ok, result } = createSuite("stay share");

	// ---------- what it opens with ----------
	// Dates, address and notes are what somebody turning up needs; the cost
	// and who's on the booking go on deliberately.
	eq(
		"it opens with what an arrival needs",
		Object.keys(STAY_SHARE_DEFAULTS).filter((k) => STAY_SHARE_DEFAULTS[k]).sort(),
		["address", "dates", "notes"]
	);
	ok(
		"booking is no longer a toggle",
		!Object.keys(STAY_SHARE_DEFAULTS).includes("booking")
	);

	// ---------- the heading and the dates ----------
	{
		const lines = build().split("\n");
		eq("the name stands alone", lines[0], "The Notch House");
		// Spoken the way anybody would say it, with the length in brackets.
		eq("the days lead the details", lines[1], "  Thursday to Sunday (3 nights)");
		eq("then the hours", lines[2], "  Check in 4pm, 10am out");
		eq("then the address", lines[3], "  14 Profile Road, Franconia, NH");
	}
	eq(
		"one night reads as one",
		build({}, [{ text: "A", date: "2026-09-17", nights: 1 }]),
		"A\n  Thursday to Friday (1 night)"
	);
	// Past a week the weekday comes round again, so "Thursday to Thursday"
	// could be seven nights or fourteen — the dates disambiguate it.
	ok(
		"a long stay carries its dates",
		build({}, [{ text: "A", date: "2026-09-17", nights: 9 }]).includes(
			"Thursday 17 September to Saturday 26 September (9 nights)"
		)
	);
	// With no check-in there are no days to name, but the length still holds.
	eq(
		"undated falls back to the length",
		build({}, [{ text: "A", nights: 3 }]),
		"A\n  3 nights"
	);
	eq(
		"and a bare stay is just its name",
		build({}, [{ text: "Somewhere" }]),
		"Somewhere"
	);
	// Turning the line off should lose the days, not how long you're there.
	eq(
		"Dates off gives the nights back to the heading",
		build({ dates: false }, [{ text: "A", date: "2026-09-17", nights: 3 }]),
		"A: 3 nights"
	);

	// ---------- chronological order ----------
	{
		// Stored latest-first; read as an itinerary, so it comes back sorted.
		const text = buildStayShareText(
			[
				{ text: "Third", date: "2026-09-20", nights: 1 },
				{ text: "First", date: "2026-09-17", nights: 1 },
				{ text: "Undated" },
				{ text: "Second", date: "2026-09-18", nights: 1 },
			],
			detail({ dates: false })
		);
		eq(
			"earliest check-in first, undated last",
			text.split("\n\n").map((b) => b.split("\n")[0]),
			["First: 1 night", "Second: 1 night", "Third: 1 night", "Undated"]
		);
	}

	// ---------- the toggles ----------
	{
		const all = build({ people: true, costs: true });
		ok("the address is there", all.includes("  14 Profile Road, Franconia, NH"));
		ok("so are the people", all.includes("  Callan, Cormac"));
		ok("and the cost", all.includes("  $340.00"));
		// No toggle: a message about where you're staying that quietly omits
		// "nobody has booked this" is the wrong message.
		ok("and what's been booked", all.includes("  Booked"));
		// Notes last: a door code and a paragraph both live in that field.
		eq("notes come last", all.split("\n\n")[0].split("\n").at(-1), "  Key in the lockbox — code 4417.");
	}
	ok("Dates off drops the days", !build({ dates: false }).includes("Thursday"));
	ok("Address off drops it", !build({ address: false }).includes("Profile Road"));
	ok("Notes off drops them", !build({ notes: false }).includes("lockbox"));
	ok("People off drops them", !build({ people: false }).includes("Cormac"));
	ok("Costs off drops it", !build({ costs: false }).includes("$340.00"));
	// "Need to book" rather than the shorter stored label: on a line of its
	// own the short one reads as a category instead of a prompt.
	ok("an unbooked stay says what's needed", build().includes("  Need to book"));
	// A stay that needs no booking has nothing to say about one.
	eq(
		"and one that needs none says nothing",
		build({}, [{ text: "A friend's spare room", booked: "none" }]),
		"A friend's spare room"
	);

	// ---------- more than one ----------
	{
		const text = build();
		eq("a blank line separates stays", text.split("\n\n").length, 2);
		ok("the second is there in full", text.includes("Backup near Lincoln\n  Need to book"));
	}
	eq("nothing recorded, nothing copied", build({}, []), "");

	return result();
}
