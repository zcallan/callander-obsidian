import { createSuite } from "./harness.mjs";
import {
	EXPENSE_SHARE_DEFAULTS,
	buildExpenseShareText,
	shareFieldsFor,
} from "./.build/callander.mjs";

const even = (label, amount, extra = {}) => ({
	label,
	amount,
	split: { mode: "even" },
	...extra,
});

/** Callan paid; the other two owe their share. */
const INPUT = {
	expenses: [
		even("Cabin", 300),
		even("Taxi", 30, { paid: ["Callan", "Riley", "Laura"], settled: true }),
		{
			label: "Dinner",
			amount: 90,
			split: { mode: "shares", shares: { Callan: 1, Riley: 2 } },
		},
	],
	credits: [{ person: "Riley", amount: 20, note: "petrol" }],
	participants: ["Callan", "Riley", "Laura"],
	yourName: "Callan",
};

const detail = (over = {}) => ({ ...EXPENSE_SHARE_DEFAULTS, ...over });
const build = (scope, over) =>
	buildExpenseShareText({ ...INPUT, scope }, detail(over));

/**
 * A plan's costs as text you can paste where nobody has the vault.
 *
 * The rules that matter: the figures have to match what the page shows, and
 * a toggle has to change exactly the thing it names.
 */
export function run() {
	const { eq, ok, result } = createSuite("expense share");

	// ---------- which toggles a scope offers ----------
	// A toggle with nothing to act on is worse than no toggle: it looks
	// broken when pressing it changes nothing.
	const ids = (scope) => shareFieldsFor(scope).map((f) => f.id);
	eq("one expense has no credits or totals to offer", ids({ kind: "expense", index: 0 }), [
		"split",
		"people",
		"hideSettled",
	]);
	eq("one person is their own People", ids({ kind: "person", person: "Riley" }), [
		"split",
		"credits",
		"totals",
		"hideSettled",
	]);
	eq("the whole section offers the lot", ids({ kind: "all" }), [
		"split",
		"people",
		"credits",
		"totals",
		"hideSettled",
	]);

	// ---------- one expense ----------
	{
		const text = build({ kind: "expense", index: 0 });
		eq("it leads with the expense and its total", text.split("\n")[0], "Cabin — $300.00 (split evenly)");
		eq("and lists each share beneath, indented", text.split("\n").slice(1), [
			"  Callan $100.00",
			"  Riley $100.00",
			"  Laura $100.00",
		]);
	}
	eq(
		"Split off drops the how, not the figure",
		build({ kind: "expense", index: 0 }, { split: false }).split("\n")[0],
		"Cabin — $300.00"
	);
	eq(
		"People off leaves the expense alone",
		build({ kind: "expense", index: 0 }, { people: false }),
		"Cabin — $300.00 (split evenly)"
	);
	// A settled expense still prints its own heading — it's the thing you
	// asked to copy — but says so.
	ok(
		"a settled expense says it is",
		build({ kind: "expense", index: 1 }).startsWith("Taxi — $30.00 (split evenly) — settled")
	);
	eq(
		"Hide settled drops the people who are square",
		build({ kind: "expense", index: 1 }, { hideSettled: true }),
		"Taxi — $30.00 (split evenly) — settled"
	);
	eq("an index nobody has copies nothing", build({ kind: "expense", index: 9 }), "");

	// ---------- one person ----------
	{
		const text = build({ kind: "person", person: "Riley" });
		const lines = text.split("\n");
		eq("it opens with the person", lines[0], "Riley");
		ok("their share of each cost is listed", text.includes("Cabin (split evenly) $100.00"));
		// Shares mode names the person's own weighting rather than the mode.
		ok("shares name the weighting", text.includes("Dinner (2 shares) $60.00"));
		ok("a settled line says so", text.includes("Taxi (split evenly) $10.00 — settled"));
		ok("credits get their own block", text.includes("Credits\npetrol −$20.00"));
		// 100 + 60 - 20; the settled taxi is listed but doesn't count.
		ok("and the total is what's left", text.endsWith("Total left to pay $140.00"));
	}
	ok(
		"your own row can't owe you, so it says what it is",
		build({ kind: "person", person: "Callan" }).includes("My total split")
	);
	ok(
		"Credits off drops the block",
		!build({ kind: "person", person: "Riley" }, { credits: false }).includes("Credits")
	);
	{
		const text = build({ kind: "person", person: "Riley" }, { hideSettled: true });
		ok("Hide settled drops the settled line", !text.includes("Taxi"));
		// It was never counted, so hiding it must not move the total.
		ok("without moving the total", text.endsWith("Total left to pay $140.00"));
	}

	// ---------- the whole section ----------
	{
		const text = build({ kind: "all" });
		ok("the title leads when given", buildExpenseShareText(
			{ ...INPUT, scope: { kind: "all" }, title: "Leaf-peeping" },
			detail()
		).startsWith("Leaf-peeping\n\n"));
		ok("expenses come first", text.startsWith("Expenses\n"));
		ok("every expense is there", ["Cabin", "Taxi", "Dinner"].every((l) => text.includes(l)));
		ok("credits name the person", text.includes("Credits\nRiley −$20.00 (petrol)"));
		ok("totals close it", text.includes("Totals\n"));
		// Riley: 100 + 60 - 20 = 140. Laura: 100. Callan: 100 + 30 = 130.
		ok("and match what the page shows", text.includes("Riley $140.00"));
	}
	{
		const text = build({ kind: "all" }, { hideSettled: true });
		ok("Hide settled drops a settled expense outright", !text.includes("Taxi"));
		ok("but keeps the open ones", text.includes("Cabin"));
	}
	{
		const bare = build({ kind: "all" }, {
			split: false,
			people: false,
			credits: false,
			totals: false,
		});
		eq("everything off leaves just the expenses", bare.split("\n"), [
			"Expenses",
			"Cabin — $300.00",
			"Taxi — $30.00 — settled",
			"Dinner — $90.00",
		]);
	}
	eq(
		"nothing recorded, nothing copied",
		buildExpenseShareText(
			{ scope: { kind: "all" }, expenses: [], credits: [], participants: [], yourName: "" },
			detail()
		),
		""
	);

	return result();
}
