import { createSuite } from "./harness.mjs";
import { IDEA_SHARE_DEFAULTS, buildIdeaShareText } from "./.build/callander.mjs";

const IDEAS = [
	{ text: "Cannolis in North End", categories: ["Boston"], time: "late-night" },
	{
		text: "Brattle Bookstore",
		categories: ["Boston"],
		dates: ["2026-08-22", "2026-08-23"],
		time: "all-day",
		cost: 0,
		people: "Riley",
		notes: "Cash only downstairs.",
	},
	{ text: "Dead Rabbit", categories: ["New York"] },
	{ text: "Old Mate's", categories: ["New York"] },
];

const detail = (over = {}) => ({ ...IDEA_SHARE_DEFAULTS, ...over });
const build = (over, ideas = IDEAS) => buildIdeaShareText(ideas, detail(over));

/**
 * A plan's ideas as the shortlist you'd paste into a chat.
 *
 * Grouped through the same call the section renders from, so the message
 * and the screen can't disagree about which heading something sits under.
 */
export function run() {
	const { eq, ok, result } = createSuite("idea share");

	// ---------- what it opens with ----------
	// When, and roughly when: the two things that decide whether an idea is
	// possible at all.
	eq(
		"it opens with what makes an idea possible",
		Object.keys(IDEA_SHARE_DEFAULTS).filter((k) => IDEA_SHARE_DEFAULTS[k]).sort(),
		["dates", "time"]
	);

	// ---------- the shape ----------
	{
		const text = build();
		eq("categories head their own block", text.split("\n\n").length, 2);
		eq("with a blank line between them", text.split("\n\n")[1].split("\n")[0], "New York");
		eq(
			"items are dashed, with their meta after a bullet",
			text.split("\n\n")[0].split("\n"),
			[
				"Boston",
				"- Cannolis in North End • Late night",
				"- Brattle Bookstore • Sat 22 Aug - Sun 23 Aug • All day",
			]
		);
		eq(
			"an idea with nothing on it is just its name",
			text.split("\n\n")[1].split("\n").slice(1),
			["- Dead Rabbit", "- Old Mate's"]
		);
	}
	// Nothing categorised is not a distinction worth heading.
	eq(
		"an uncategorised list gets no heading",
		build({}, [{ text: "Just this" }]),
		"- Just this"
	);
	// The grouping is a lens, not a filing cabinet — the section says so too.
	{
		const text = build({}, [{ text: "Both", categories: ["A", "B"] }]);
		eq("an idea in two categories appears under each", text, "A\n- Both\n\nB\n- Both");
	}
	// "Other" only earns a heading when something else is grouped.
	{
		const text = build({}, [
			{ text: "Filed", categories: ["A"] },
			{ text: "Loose" },
		]);
		ok("a stray idea lands under Other", text.includes("Other\n- Loose"));
	}

	// ---------- the toggles ----------
	ok("Dates off drops the days", !build({ dates: false }).includes("22 Aug"));
	ok("Time off drops it", !build({ time: false }).includes("All day"));
	ok("Cost is off to begin with", !build().includes("Free"));
	ok("and shows when asked for", build({ cost: true }).includes("Free"));
	ok("People off drops them", !build().includes("Riley"));
	ok("and on adds them", build({ people: true }).includes("• Riley"));
	{
		// A note is a sentence where the rest of the row is labels, so it
		// takes its own indented line rather than another bullet.
		const text = build({ notes: true });
		ok("notes sit under their idea", text.includes("\n  Cash only downstairs."));
		ok("and not on the item line", !text.includes("• Cash only"));
	}
	ok("notes are off to begin with", !build().includes("Cash only"));

	eq("nothing recorded, nothing copied", build({}, []), "");

	return result();
}
