import { createSuite } from "./harness.mjs";
import {
	STAY_SHARE_DEFAULTS,
	buildStayShareText,
	staysInOrder,
} from "./.build/callander.mjs";

const STAYS = [
	{
		text: "The Notch House",
		// Thursday 17 September 2026 — so the nights are Thu, Fri, Sat.
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
		// The nights slept, not check-in to check-out: three from Thursday
		// is Thu, Fri and Sat, and you leave on the Sunday.
		eq("the nights lead the details", lines[1], "  Thursday-Saturday night (3 nights)");
		eq("then the hours", lines[2], "  Check in 4pm, 10am out");
		eq("then the address", lines[3], "  14 Profile Road, Franconia, NH");
	}
	eq(
		"one night names just that night",
		build({}, [{ text: "A", date: "2026-09-18", nights: 1 }]),
		"A\n  Friday night (1 night)"
	);
	// Two get a plus — listing both is shorter than any range of them.
	eq(
		"two nights are joined, not spanned",
		build({}, [{ text: "A", date: "2026-09-18", nights: 2 }]),
		"A\n  Friday+Saturday night (2 nights)"
	);
	eq(
		"three or more take a dash",
		build({}, [{ text: "A", date: "2026-09-18", nights: 3 }]),
		"A\n  Friday-Sunday night (3 nights)"
	);
	// The same weekday can come round twice; no dates are added for it,
	// because the count in brackets already says which one this is.
	eq(
		"a long stay leans on the count, not on dates",
		build({}, [{ text: "A", date: "2026-09-18", nights: 8 }]),
		"A\n  Friday-Friday night (8 nights)"
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

	// ---------- the order both views read in ----------
	// The section on screen sorts through this too, and edits write back
	// through the index — so it has to be the stored one, not the position
	// the row ended up in.
	{
		const stored = [
			{ text: "Third", date: "2026-09-20" },
			{ text: "First", date: "2026-09-17" },
			{ text: "Undated" },
			{ text: "Second", date: "2026-09-18" },
		];
		const sorted = staysInOrder(stored);
		eq("earliest check-in leads", sorted.map((r) => r.stay.text), [
			"First",
			"Second",
			"Third",
			"Undated",
		]);
		eq("and each keeps where it's stored", sorted.map((r) => r.index), [1, 3, 0, 2]);
		// Editing the first row on screen must reach the stay it shows.
		eq(
			"so an edit reaches the row you tapped",
			stored[sorted[0].index].text,
			"First"
		);
		eq("nothing is lost or repeated", sorted.length, stored.length);
	}
	{
		// Stable, so two stays checking in the same day don't swap about
		// between renders.
		const same = staysInOrder([
			{ text: "A", date: "2026-09-17" },
			{ text: "B", date: "2026-09-17" },
		]);
		eq("a shared date keeps the order it was stored in", same.map((r) => r.stay.text), ["A", "B"]);
	}
	eq("nothing in, nothing out", staysInOrder([]), []);

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
		// Written as every share text writes a cost (UB-B14): whole dollars
		// short, "Free" for nothing.
		ok("and the cost", all.includes("  $340\n") || all.endsWith("  $340"));
		// Only the outstanding state earns a line — every stay listed is one
		// you mean to use, so "Booked" on most of them buries the one that
		// still needs doing.
		ok("a booked stay says nothing about it", !all.includes("Booked"));
		// Notes last: a door code and a paragraph both live in that field.
		eq("notes come last", all.split("\n\n")[0].split("\n").at(-1), "  Key in the lockbox — code 4417.");
	}
	ok("Dates off drops the nights line", !build({ dates: false }).includes("night ("));
	ok("Address off drops it", !build({ address: false }).includes("Profile Road"));
	ok("Notes off drops them", !build({ notes: false }).includes("lockbox"));
	ok("People off drops them", !build({ people: false }).includes("Cormac"));
	ok("Costs off drops it", !build({ costs: false }).includes("$340.00"));
	// "Need to book" rather than the shorter stored label: on a line of its
	// own the short one reads as a category instead of a prompt.
	ok("an unbooked stay says what's needed", build().includes("  Need to book"));
	// Neither a stay that needs no booking nor one already made.
	eq(
		"and one that needs none says nothing",
		build({}, [{ text: "A friend's spare room", booked: "none" }]),
		"A friend's spare room"
	);
	eq(
		"nor does one already booked",
		build({}, [{ text: "The Notch House", booked: "booked" }]),
		"The Notch House"
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
