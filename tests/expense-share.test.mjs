import { createSuite } from "./harness.mjs";
import {
	buildExpenseShareText,
	shareDefaultsFor,
	shareFieldsFor,
} from "./.build/callander.mjs";

const even = (label, amount, extra = {}) => ({
	label,
	amount,
	split: { mode: "even" },
	...extra,
});

/** Casey paid; the other two owe their share. */
const INPUT = {
	expenses: [
		even("Cabin", 300),
		even("Taxi", 30, { paid: ["Casey", "Rowan", "Livia"], settled: true }),
		{
			label: "Dinner",
			amount: 90,
			split: { mode: "shares", shares: { Casey: 1, Rowan: 2 } },
		},
	],
	credits: [{ person: "Rowan", amount: 20, note: "petrol" }],
	participants: ["Casey", "Rowan", "Livia"],
	yourName: "Casey",
};

const detail = (scope, over = {}) => ({ ...shareDefaultsFor(scope), ...over });
const build = (scope, over) =>
	buildExpenseShareText({ ...INPUT, scope }, detail(scope, over));

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
		"people",
		"hideMe",
		"hideSettled",
	]);
	eq("one person is their own People, and can't hide you", ids({ kind: "person", person: "Rowan" }), [
		"credits",
		"totals",
		"hideSettled",
	]);
	eq("the whole section offers the lot", ids({ kind: "all" }), [
		"people",
		"credits",
		"totals",
		"hideMe",
		"hideSettled",
	]);

	// ---------- what each scope opens with ----------
	// A section is read as a chase-up; one expense as an explanation of how
	// a bill was carved up. The defaults follow that, so they differ.
	const opens = (scope) => {
		const d = shareDefaultsFor(scope);
		return Object.keys(d).filter((k) => d[k]).sort();
	};
	eq("a section opens hiding you and what's settled", opens({ kind: "all" }), [
		"credits",
		"hideMe",
		"hideSettled",
		"people",
		"totals",
	]);
	eq("an expense opens keeping what's paid", opens({ kind: "expense", index: 0 }), [
		"credits",
		"hideMe",
		"people",
		"totals",
	]);
	// A person's ledger keeps its settled lines where a section drops them.
	eq("a person's ledger opens showing what's paid", opens({ kind: "person", person: "Rowan" }), [
		"credits",
		"hideMe",
		"people",
		"totals",
	]);
	eq("hiding you is on wherever it applies", shareDefaultsFor({ kind: "all" }).hideMe, true);

	// ---------- one expense ----------
	{
		const text = build({ kind: "expense", index: 0 });
		eq("a colon joins the expense to its total", text.split("\n")[0], "Cabin: $300.00");
		// A dash between a person and their share, and you are left out.
		eq("a dash joins a person to their share", text.split("\n").slice(1), [
			"  Rowan — $100.00",
			"  Livia — $100.00",
		]);
	}
	eq(
		"Hide me off puts you back",
		build({ kind: "expense", index: 0 }, { hideMe: false }).split("\n")[1],
		"  Casey — $100.00"
	);
	eq(
		"People off leaves the expense alone",
		build({ kind: "expense", index: 0 }, { people: false }),
		"Cabin: $300.00"
	);
	{
		// Settled shows by default here: the point of copying one expense is
		// often to show it is square.
		const text = build({ kind: "expense", index: 1 });
		ok("a settled expense says so", text.startsWith("Taxi: $30.00 (Paid)"));
		ok("and so does each settled person", text.includes("  Rowan — $10.00 (Paid)"));
	}
	eq(
		"Hide settled drops the people who are square",
		build({ kind: "expense", index: 1 }, { hideSettled: true }),
		"Taxi: $30.00 (Paid)"
	);
	eq("an index nobody has copies nothing", build({ kind: "expense", index: 9 }), "");

	// ---------- one person ----------
	{
		const text = build({ kind: "person", person: "Rowan" });
		const lines = text.split("\n");
		eq("it opens with the person", lines[0], "Rowan");
		eq("a blank line follows the name", lines[1], "");
		ok("a dash joins the cost to the figure", text.includes("Cabin — $100.00"));
		ok("and the figure is this person's share", text.includes("Dinner — $60.00"));
		// A credit runs the other way to every other line here, so it reads
		// as a plus rather than as a smaller debt — which is enough on its
		// own, so it sits in with the expenses rather than under a heading.
		ok("credits run in with the expenses", text.includes("petrol — +$20.00"));
		ok("with no heading of their own", !text.includes("Credits"));
		// They come last, because they're what comes off the sum above.
		eq(
			"and they come after the costs",
			text.split("\n").filter(Boolean).at(-2),
			"petrol — +$20.00"
		);
		ok("and the total takes a colon", text.endsWith("Total: $140.00"));
	}
	{
		// Settled lines show here by default, unlike a whole section: they
		// are the working that explains a smaller number than expected.
		const text = build({ kind: "person", person: "Rowan" });
		ok("a settled line is listed", text.includes("Taxi — $10.00 (Paid)"));
		ok("but doesn't count toward the total", text.endsWith("Total: $140.00"));
	}
	{
		const text = build({ kind: "person", person: "Rowan" }, { hideSettled: true });
		ok("Hide settled drops it", !text.includes("Taxi"));
		// It was never counted, so hiding it must not move the total.
		ok("without moving the total", text.endsWith("Total: $140.00"));
	}
	// The name is the first line, so the total needs no qualifying — and it
	// reads the same for your own ledger as for anyone else's.
	ok(
		"your own ledger totals the same way",
		build({ kind: "person", person: "Casey" }).includes("Total: ")
	);
	{
		// The heading is gone, so this has to test the line itself — looking
		// for the word "Credits" passed whatever the toggle did, which
		// mutation testing caught.
		const off = build({ kind: "person", person: "Rowan" }, { credits: false });
		ok("Credits off drops the credit line", !off.includes("petrol"));
		ok("and no stray plus survives it", !off.includes("+$"));
		// It comes off the sum either way — hiding a line can't change what
		// somebody owes.
		ok("without moving the total", off.endsWith("Total: $140.00"));
	}

	// ---------- the whole section ----------
	{
		const text = build({ kind: "all" }, { hideSettled: false });
		const lines = text.split("\n");
		// The plan's name is on the page you copied from; repeating it here
		// tells the reader nothing they don't have.
		eq("no plan name leads it", lines[0], "Expenses");
		eq("a blank line follows the heading", lines[1], "");
		ok("a colon joins a person to their share here", text.includes("  Rowan: $100.00"));
		ok("credits name the person", text.includes("Credits\n\nRowan: −$20.00 (petrol)"));
		ok("totals get their own blank line", text.includes("Totals\n\n"));
		ok("and match what the page shows", text.includes("Rowan: $140.00"));
		// You're the one being paid, so you're out of the list by default.
		ok("you are left out", !text.includes("Casey:"));
		// A blank line between expenses, so a run doesn't read as one block.
		ok("expenses are spaced apart", text.includes("$300.00\n  Rowan: $100.00\n  Livia: $100.00\n\nTaxi"));
	}
	{
		// With no shares underneath, every expense is one line — the gap it
		// was separating no longer exists, and spacing them apart only makes
		// a tight list sparse.
		const text = build({ kind: "all" }, { people: false, hideSettled: false });
		eq("without People the expenses run together", text.split("\n").slice(0, 5), [
			"Expenses",
			"",
			"Cabin: $300.00",
			"Taxi: $30.00 (Paid)",
			"Dinner: $90.00",
		]);
		// The heading's own blank line stays: it separates a heading from a
		// list, which is a different job.
		eq("but the heading keeps its own", text.split("\n")[1], "");
	}
	{
		const text = build({ kind: "all" });
		ok("Hide settled drops a settled expense outright", !text.includes("Taxi"));
		ok("but keeps the open ones", text.includes("Cabin"));
	}
	eq(
		"nothing recorded, nothing copied",
		buildExpenseShareText(
			{ scope: { kind: "all" }, expenses: [], credits: [], participants: [], yourName: "" },
			detail({ kind: "all" })
		),
		""
	);

	return result();
}
