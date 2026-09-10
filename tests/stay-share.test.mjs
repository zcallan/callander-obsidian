import { createSuite } from "./harness.mjs";
import { STAY_SHARE_DEFAULTS, buildStayShareText } from "./.build/callander.mjs";

const STAYS = [
	{
		text: "The Notch House",
		nights: 2,
		checkIn: "16:00",
		checkOut: "10:00",
		address: "14 Profile Road, Franconia, NH",
		notes: "Key in the lockbox — code 4417.",
		people: "Callan, Cormac",
		cost: 340,
		booked: "booked",
	},
	// The sparse case: a name and nothing else agreed yet.
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
	// Address and notes are what somebody arriving needs; the cost and who's
	// on the booking are yours to know and go on deliberately.
	eq(
		"it opens with what an arrival needs",
		Object.keys(STAY_SHARE_DEFAULTS).filter((k) => STAY_SHARE_DEFAULTS[k]).sort(),
		["address", "booking", "notes"]
	);

	// ---------- the heading ----------
	{
		const lines = build().split("\n");
		eq("nights ride with the name", lines[0], "The Notch House: 2 nights");
		// The hours are a phrase rather than a range, so they take a line of
		// their own rather than a parenthetical on the heading.
		eq("hours lead the details", lines[1], "  Check in 4pm, 10am out");
		eq("details are indented", lines[2], "  14 Profile Road, Franconia, NH");
	}
	eq(
		"one night reads as one",
		build({}, [{ text: "A", nights: 1 }]),
		"A: 1 night"
	);
	// A stay nobody has pinned down is still worth listing — it's the one
	// most likely to need chasing.
	eq(
		"a bare stay is just its name",
		build({ booking: false }, [{ text: "Somewhere" }]),
		"Somewhere"
	);

	// ---------- the toggles ----------
	{
		const all = build({ people: true, costs: true });
		ok("the address is there", all.includes("  14 Profile Road, Franconia, NH"));
		ok("so are the people", all.includes("  Callan, Cormac"));
		ok("and the cost", all.includes("  $340.00"));
		ok("and what's been booked", all.includes("  Booked"));
		// Notes last: a door code and a paragraph both live in that field.
		ok("the hours are there without a toggle", all.includes("  Check in 4pm, 10am out"));
		eq("notes come last", all.split("\n\n")[0].split("\n").at(-1), "  Key in the lockbox — code 4417.");
	}
	ok("Address off drops it", !build({ address: false }).includes("Profile Road"));
	ok("Notes off drops them", !build({ notes: false }).includes("lockbox"));
	ok("People off drops them", !build({ people: false }).includes("Cormac"));
	ok("Costs off drops it", !build({ costs: false }).includes("$340.00"));
	{
		const off = build({ booking: false });
		ok("Booking off drops both states", !off.includes("Booked") && !off.includes("Need to book"));
	}
	// "Need to book" rather than the shorter stored label: on a line of its
	// own the short one reads as a category instead of a prompt.
	ok("an unbooked stay says what's needed", build().includes("  Need to book"));
	// A stay that needs no booking has nothing to say about one.
	ok(
		"and one that needs none says nothing",
		build({}, [{ text: "A friend's spare room", booked: "none" }]) ===
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
