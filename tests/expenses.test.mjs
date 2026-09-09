import { createSuite } from "./harness.mjs";
import {
	breakdownFor,
	formatMoney,
	creditTotalFor,
	expensesOf,
	isFullyPaid,
	isPaidBy,
	owedFor,
	paidStateOf,
	partitionExpenses,
	payersOf,
	percentFromInput,
	planOwedSummary,
	setPaidOn,
	settleAllFor,
} from "./.build/callander.mjs";

export function run() {
	const { eq, result } = createSuite("expenses & settling");

	const participants = ["Callan", "Riley", "Laura"];
	/** What the breakdown modal totals — settled lines are shown but excluded. */
	const modalTotal = (rows) =>
		rows.reduce((s, r) => (r.settled ? s : s + r.amount), 0);

	// ---------- costsOf parses `settled` ----------
	const parsed = expensesOf({
		costs: [
			{ label: "Airbnb", amount: 90, settled: true, split: { mode: "even" } },
			{ label: "Petrol", amount: 30, split: { mode: "even" } },
			{
				label: "Groceries",
				amount: 45.1,
				settled: false,
				split: { mode: "even" },
			},
		],
	});
	eq("settled:true is parsed", parsed[0].settled, true);
	eq("settled absent stays absent", "settled" in parsed[1], false);
	eq("settled:false is dropped, not stored as false", "settled" in parsed[2], false);

	// ---------- owedFor is unaffected by settled ----------
	eq(
		"owedFor still computes the raw split for a settled cost",
		owedFor(
			{ label: "Airbnb", amount: 90, settled: true, split: { mode: "even" } },
			participants
		),
		{ Callan: 30, Riley: 30, Laura: 30 }
	);

	// ---------- split modes ----------
	eq(
		"even split divides equally",
		owedFor(
			{ label: "X", amount: 90, split: { mode: "even" } },
			participants
		),
		{ Callan: 30, Riley: 30, Laura: 30 }
	);
	eq(
		"shares split by weight",
		owedFor(
			{
				label: "X",
				amount: 100,
				split: { mode: "shares", shares: { Callan: 3, Riley: 1, Laura: 1 } },
			},
			participants
		),
		{ Callan: 60, Riley: 20, Laura: 20 }
	);
	eq(
		"percent split is literal",
		owedFor(
			{
				label: "X",
				amount: 200,
				split: { mode: "percent", shares: { Callan: 25, Riley: 25 } },
			},
			participants
		),
		{ Callan: 50, Riley: 50, Laura: 0 }
	);
	eq(
		"value split takes amounts at face value",
		owedFor(
			{
				label: "X",
				amount: 100,
				split: { mode: "value", shares: { Callan: 30, Riley: 20 } },
			},
			participants
		),
		{ Callan: 30, Riley: 20, Laura: 0 }
	);
	// Tax and tip are charged on the subtotal, never compounded — 6.25% and
	// 20% on $100 is $126.25, not $127.50.
	eq(
		"receipt applies tax and tip separately, not compounded",
		owedFor(
			{
				label: "Dinner",
				amount: 126.25,
				split: {
					mode: "receipt",
					shares: { Callan: 100 },
					tax: 6.25,
					tip: 20,
				},
			},
			["Callan"]
		),
		{ Callan: 126.25 }
	);

	// ---------- breakdownFor keeps settled rows, flagged ----------
	const costs = [
		{ label: "Airbnb", amount: 90, settled: true, split: { mode: "even" } },
		{ label: "Petrol", amount: 30, split: { mode: "even" } },
	];
	const rows = breakdownFor("Riley", costs, participants);
	eq(
		"breakdownFor lists settled rows too",
		rows.map((r) => r.label),
		["Airbnb", "Petrol"]
	);
	eq("the settled row is flagged", rows[0].settled, true);
	eq("the unsettled row carries no flag", "settled" in rows[1], false);
	eq("settled row keeps its real amount", rows[0].amount, 30);
	eq("breakdown total excludes settled", modalTotal(rows), 10);

	// All-settled must still return rows, so the Breakdown button stays live.
	const allSettled = [
		{ label: "Airbnb", amount: 90, settled: true, split: { mode: "even" } },
	];
	const allRows = breakdownFor("Riley", allSettled, participants);
	eq("all-settled still returns rows", allRows.length, 1);
	eq("all-settled total is zero", modalTotal(allRows), 0);

	// ---------- credits ----------
	const withCredit = breakdownFor("Riley", costs, participants, [
		{ person: "Riley", amount: 5, note: "Venmo" },
	]);
	eq(
		"credit row is not settled",
		"settled" in withCredit[withCredit.length - 1],
		false
	);
	eq("credit still reduces the total", modalTotal(withCredit), 5);
	eq(
		"creditTotalFor sums one person's credits",
		creditTotalFor("Riley", [
			{ person: "Riley", amount: 5 },
			{ person: "Riley", amount: 7 },
			{ person: "Laura", amount: 100 },
		]),
		12
	);

	// ---------- descriptor wording matches the rest of the app ----------
	const wordingCosts = [
		{ label: "Petrol", amount: 30, split: { mode: "even" } },
		{
			label: "Dinner",
			amount: 40,
			split: { mode: "receipt", shares: { Riley: 40 } },
		},
		{ label: "Ferry", amount: 20, split: { mode: "value", shares: { Riley: 20 } } },
		{ label: "Rent", amount: 100, split: { mode: "percent", shares: { Riley: 25 } } },
		{ label: "Gas", amount: 50, split: { mode: "shares", shares: { Riley: 2 } } },
	];
	const wording = breakdownFor("Riley", wordingCosts, participants);
	const descriptorFor = (label) =>
		wording.find((r) => r.label === label).descriptor;
	eq("even -> 'split evenly'", descriptorFor("Petrol"), "split evenly");
	eq("receipt -> 'by receipt'", descriptorFor("Dinner"), "by receipt");
	eq("value -> 'by value'", descriptorFor("Ferry"), "by value");
	eq("percent keeps the personal number", descriptorFor("Rent"), "25%");
	eq("shares keeps the personal count", descriptorFor("Gas"), "2 shares");

	// ---------- ad-hoc expenses carry their own people ----------
	const withPeople = expensesOf(
		{
			expenses: [
				{
					label: "Dinner",
					amount: 60,
					people: ["[[Riley Sorensen]]", "Sam from work"],
					split: { mode: "even" },
				},
				{ label: "Taxi", amount: 20, split: { mode: "even" } },
			],
		},
		"expenses"
	);
	eq(
		"people survive the round trip, wikilinks and bare names alike",
		withPeople[0].people,
		["[[Riley Sorensen]]", "Sam from work"]
	);
	eq(
		"an expense with no people has no people key",
		"people" in withPeople[1],
		false
	);
	// `paid: []` has to survive the round trip — it's what distinguishes
	// "marked unsettled" from "never touched".
	const paidRoundTrip = expensesOf({
		costs: [
			{ label: "A", amount: 1, paid: [], split: {} },
			{ label: "B", amount: 1, paid: ["Riley"], split: {} },
			{ label: "C", amount: 1, split: {} },
		],
	});
	eq("an empty paid list survives", paidRoundTrip[0].paid, []);
	eq("a populated paid list survives", paidRoundTrip[1].paid, ["Riley"]);
	eq("no paid key stays absent", "paid" in paidRoundTrip[2], false);
	eq(
		"the key is selectable — plans keep reading `costs`",
		expensesOf({ expenses: [{ label: "X", amount: 1, split: {} }] }).length,
		0
	);

	// ---------- open vs settled, without losing the write-back index ----------
	const mixed = [
		{ label: "Airbnb", amount: 90, settled: true, split: { mode: "even" } },
		{ label: "Petrol", amount: 30, split: { mode: "even" } },
		{ label: "Dinner", amount: 60, settled: true, split: { mode: "even" } },
		{ label: "Ferry", amount: 15, split: { mode: "even" } },
	];
	const parts = partitionExpenses(mixed);
	eq(
		"open keeps its original indices",
		parts.open.map((e) => e.index),
		[1, 3]
	);
	eq(
		"settled keeps its original indices",
		parts.settled.map((e) => e.index),
		[0, 2]
	);
	eq(
		"and the entries themselves come through",
		parts.settled.map((e) => e.expense.label),
		["Airbnb", "Dinner"]
	);
	eq(
		"nothing is dropped or duplicated",
		parts.open.length + parts.settled.length,
		mixed.length
	);
	eq("an empty list partitions to two empties", partitionExpenses([]), {
		open: [],
		settled: [],
	});

	// ---------- ticking people off ----------
	const dinner = {
		label: "Dinner",
		amount: 90,
		split: { mode: "even" },
	};
	const three = ["Callan", "Riley", "Laura"];

	eq(
		"payers are everyone the split actually charges",
		payersOf(dinner, three),
		three
	);
	eq(
		"someone charged nothing gets no box",
		payersOf(
			{ ...dinner, split: { mode: "value", shares: { Riley: 90 } } },
			three
		),
		["Riley"]
	);

	// You start ticked — you're the one who put the money down.
	eq(
		"with nothing recorded, only you are ticked",
		paidStateOf(dinner, three, "Callan"),
		["Callan"]
	);
	eq(
		"with no name of your own, nothing is ticked",
		paidStateOf(dinner, three, ""),
		[]
	);
	// Everything predating per-person ticks counts as fully paid.
	eq(
		"an already-settled expense shows everyone ticked",
		paidStateOf({ ...dinner, settled: true }, three, "Callan"),
		three
	);
	// The distinction that makes `paid: []` worth storing.
	eq(
		"an explicit empty list stays empty, not defaulted back to you",
		paidStateOf({ ...dinner, paid: [] }, three, "Callan"),
		[]
	);
	eq(
		"a recorded list wins over the settled flag",
		paidStateOf(
			{ ...dinner, paid: ["Riley"], settled: true },
			three,
			"Callan"
		),
		["Riley"]
	);
	eq(
		"someone no longer on the split drops out of the ticks",
		paidStateOf({ ...dinner, paid: ["Riley", "Gone"] }, three, "Callan"),
		["Riley"]
	);

	eq("everyone ticked is fully paid", isFullyPaid(three, three), true);
	eq(
		"one outstanding is not",
		isFullyPaid(["Callan", "Riley"], three),
		false
	);
	eq("nobody ticked is not", isFullyPaid([], three), false);
	// An expense charging nobody can't settle itself — that stays the
	// button's call, or it would flip to settled the moment it opened.
	eq("no payers never counts as fully paid", isFullyPaid([], []), false);

	// ---------- typing in a percent field ----------
	// The whole point: an emptied field has to read as 0, or the rebalance
	// treats it as unset and writes a figure straight back into the box you
	// were trying to clear — which makes it impossible to backspace.
	eq("an empty field is 0%", percentFromInput(""), 0);
	eq("...whitespace too", percentFromInput("   "), 0);
	eq("a typed zero is 0%", percentFromInput("0"), 0);
	eq("an ordinary figure passes through", percentFromInput("50"), 50);
	eq("decimals survive", percentFromInput("33.33"), 33.33);
	// Over 100 is intentional and visible — the modal's total says so
	// rather than the field silently clamping.
	eq("over 100 is left alone", percentFromInput("150"), 150);
	// Null means "not a percentage" — the caller keeps the last good value
	// rather than guessing.
	eq("a negative is rejected", percentFromInput("-5"), null);
	eq("nonsense is rejected", percentFromInput("abc"), null);

	// ---------- a tick settles that person's share, and only theirs ----------
	const trio = ["Callan", "Riley", "Harry"];
	const rileyPaid = [
		{
			label: "Airbnb",
			amount: 90,
			paid: ["Callan", "Riley"],
			split: { mode: "even" },
		},
	];

	eq(
		"a ticked person is square on that expense",
		isPaidBy(rileyPaid[0], "Riley"),
		true
	);
	eq(
		"an unticked person is not",
		isPaidBy(rileyPaid[0], "Harry"),
		false
	);
	eq(
		"a settled expense is square for everyone, ticks or no ticks",
		isPaidBy({ label: "X", amount: 1, settled: true, split: {} }, "Harry"),
		true
	);

	// Riley's line still shows — it's the record of what was squared up —
	// but stops counting toward what's owed.
	const rileyRows = breakdownFor("Riley", rileyPaid, trio);
	eq("Riley's line is still listed", rileyRows.length, 1);
	eq("...flagged as settled", rileyRows[0].settled, true);
	eq("...and out of the total", modalTotal(rileyRows), 0);

	// Harry hasn't paid, so nothing changes for him.
	const harryRows = breakdownFor("Harry", rileyPaid, trio);
	eq("Harry's line is not settled", harryRows[0].settled, undefined);
	eq("...and still counts", modalTotal(harryRows), 30);

	// The expense as a whole is still open — one tick doesn't settle it.
	eq(
		"one tick short of everyone leaves it open",
		isFullyPaid(rileyPaid[0].paid, payersOf(rileyPaid[0], trio)),
		false
	);

	// ---------- planOwedSummary: the plan's "Who owes what" ----------
	// Even split of $30 across three, nobody ticked off.
	{
		const costs = [
			{ label: "Dinner", amount: 30, split: { mode: "even" }, paidBy: "Me" },
		];
		const people = ["Me", "Riley", "Harry"];
		const { rows, outstanding } = planOwedSummary(costs, [], people, "Me", []);
		const by = (n) => rows.find((r) => r.person === n);
		eq("everyone appears once", rows.length, 3);
		eq("a share is owed", Math.round(by("Riley").net * 100) / 100, 10);
		eq("your own row is marked", by("Me").isYou, true);
		// You can't owe yourself, so your share never joins the chase total.
		eq("the total excludes you", Math.round(outstanding * 100) / 100, 20);
	}

	// A settled expense drops out entirely.
	{
		const costs = [
			{ label: "Dinner", amount: 30, split: { mode: "even" }, paidBy: "Me", settled: true },
		];
		const { outstanding } = planOwedSummary(costs, [], ["Me", "Riley"], "Me", []);
		eq("a settled expense owes nothing", outstanding, 0);
	}

	// Ticked off on one expense: they've handed their share over even though
	// the expense as a whole is still waiting on someone else.
	{
		const costs = [
			{ label: "Dinner", amount: 30, split: { mode: "even" }, paidBy: "Me", paid: ["Riley"] },
		];
		const people = ["Me", "Riley", "Harry"];
		const { rows } = planOwedSummary(costs, [], people, "Me", []);
		const by = (n) => rows.find((r) => r.person === n);
		eq("a per-expense tick clears that share", by("Riley").net, 0);
		eq("...and owing nothing counts as square", by("Riley").square, true);
		eq("...while the others still owe", Math.round(by("Harry").net * 100) / 100, 10);
	}

	// Credits net off what's owed.
	{
		const costs = [
			{ label: "Dinner", amount: 20, split: { mode: "even" }, paidBy: "Me" },
		];
		const credits = [{ person: "Riley", amount: 10 }];
		const { rows } = planOwedSummary(costs, credits, ["Me", "Riley"], "Me", []);
		eq(
			"a credit cancels the share",
			rows.find((r) => r.person === "Riley").net,
			0
		);
	}

	// Square people sort last, so what's left to chase leads the list.
	{
		const costs = [
			{ label: "Dinner", amount: 30, split: { mode: "even" }, paidBy: "Me" },
		];
		const credits = [{ person: "Riley", amount: 10 }];
		const people = ["Me", "Riley", "Harry"];
		const { rows } = planOwedSummary(costs, credits, people, "Me", []);
		// Me owes a share too — an even split across three includes you —
		// so the only square person here is the one the credit cleared.
		eq(
			"outstanding first, square after",
			rows.map((r) => r.square),
			[false, false, true]
		);
		eq(
			"...and the square one is the credited person",
			rows[rows.length - 1].person,
			"Riley"
		);
	}

	// Being ticked off in costsPaid marks the row done and stops the chase,
	// without pretending the amount itself is zero.
	{
		const costs = [
			{ label: "Dinner", amount: 20, split: { mode: "even" }, paidBy: "Me" },
		];
		const { rows, outstanding } = planOwedSummary(
			costs,
			[],
			["Me", "Riley"],
			"Me",
			["Riley"]
		);
		const riley = rows.find((r) => r.person === "Riley");
		eq("a ticked person reads as done", riley.done, true);
		eq("...but still shows what they owed", riley.net, 10);
		eq("...and drops out of the total", outstanding, 0);
	}

	eq(
		"no participants is no rows",
		planOwedSummary([], [], [], "Me", []).rows,
		[]
	);

	// ---------- breakdown rows carry their kind ----------
	// The grouped breakdown puts expenses and credits under separate
	// headings, and it can't tell them apart by label: an expense somebody
	// named "Credit" would land in the wrong group.
	{
		const rows = breakdownFor(
			"Riley",
			[
				{ label: "Dinner", amount: 20, split: { mode: "even" } },
				// The collision the discriminator exists for.
				{ label: "Credit", amount: 10, split: { mode: "even" } },
			],
			["Callan", "Riley"],
			[{ person: "Riley", amount: 4, note: "petrol" }]
		);
		eq("every line says which it is", rows.map((r) => r.kind), [
			"expense",
			"expense",
			"credit",
		]);
		eq(
			"an expense named Credit is still an expense",
			rows.find((r) => r.label === "Credit" && r.kind === "expense")?.amount,
			5
		);
		eq("a credit is negative", rows.at(-1)?.amount, -4);
		eq("and keeps its note", rows.at(-1)?.descriptor, "petrol");
		// The note is what the row reads out, so an empty one still has to
		// say something rather than leaving the line blank.
		eq(
			"an unnoted credit still says something",
			breakdownFor("Riley", [], ["Riley"], [{ person: "Riley", amount: 4 }])[0]
				?.descriptor,
			"no reason given"
		);
		// Grouping must not disturb the arithmetic the modal totals.
		eq("the total still nets out", modalTotal(rows), 11);
		// The ledger ticks lines off in place, and writes back through this.
		eq("expense lines carry their index", rows.map((r) => r.index), [
			0,
			1,
			undefined,
		]);
	}

	{
		// An expense somebody isn't charged for has no line, so the indices
		// have to be the position in the plan's list, not in the breakdown.
		const rows = breakdownFor(
			"Riley",
			[
				{ label: "Just Callan", amount: 10, split: { mode: "value", shares: { Callan: 10 } } },
				{ label: "Both", amount: 20, split: { mode: "even" } },
			],
			["Callan", "Riley"]
		);
		eq("a line skipped over doesn't shift the ones after it", rows.map((r) => r.index), [1]);
	}

	// ---------- how a figure is written ----------
	// Shared by the plan's list and the ledger, which show the same credit.
	eq("a plain figure takes two decimals", formatMoney(146), "$146.00");
	eq("and rounds to the cent", formatMoney(12.005), "$12.01");
	// U+2212, not a hyphen: same width as a digit, so a tabular column stays
	// in line whether or not a row is negative.
	eq("a negative leads with a true minus", formatMoney(-20), "\u2212$20.00");
	eq("the sign goes outside the dollar", formatMoney(-20).slice(0, 2), "\u2212$");
	eq("zero carries no sign", formatMoney(0), "$0.00");

	// ---------- settling from the ledger ----------
	const even = (label, amount) => ({ label, amount, split: { mode: "even" } });
	{
		const cost = even("Dinner", 20);
		const ticked = setPaidOn(cost, "Riley", true, ["Callan", "Riley"], "Callan");
		eq("ticking records the person", ticked.paid, ["Callan", "Riley"]);
		// You start ticked because you put the money down, so Riley's tick is
		// the last one and the expense settles itself.
		eq("the last tick settles the expense", ticked.settled, true);

		const back = setPaidOn(ticked, "Riley", false, ["Callan", "Riley"], "Callan");
		eq("unticking takes them back off", back.paid, ["Callan"]);
		eq("and reopens the expense", back.settled, undefined);
	}
	{
		// Three payers: one tick isn't enough to settle the whole thing.
		const cost = even("Cabin", 30);
		const one = setPaidOn(cost, "Riley", true, ["Callan", "Riley", "Laura"], "Callan");
		eq("a tick short of everyone leaves it open", one.settled, undefined);
		eq("...but is recorded", one.paid, ["Callan", "Riley"]);
	}
	{
		const cost = even("Dinner", 20);
		eq(
			"someone the split doesn't charge is left alone",
			setPaidOn(cost, "Nobody", true, ["Callan", "Riley"], "Callan"),
			cost
		);
		// Idempotent, so a double-tap can't push a name in twice.
		const once = setPaidOn(cost, "Riley", true, ["Callan", "Riley"], "Callan");
		eq("ticking twice changes nothing", setPaidOn(once, "Riley", true, ["Callan", "Riley"], "Callan"), once);
	}
	{
		const costs = [
			even("Dinner", 20),
			even("Cabin", 30),
			// Riley is charged nothing here, so it must come back untouched.
			{ label: "Callan only", amount: 10, split: { mode: "value", shares: { Callan: 10 } } },
		];
		const after = settleAllFor("Riley", costs, ["Callan", "Riley"], "Callan");
		eq("settling everything ticks every line they're on", after.map((c) => c.paid ?? null), [
			["Callan", "Riley"],
			["Callan", "Riley"],
			null,
		]);
		eq("one they aren't charged for is untouched", after[2], costs[2]);
		// The whole point: their balance actually reaches zero.
		eq(
			"and it zeroes what they owe",
			planOwedSummary(after, [], ["Callan", "Riley"], "Callan", []).rows.find(
				(r) => r.person === "Riley"
			).square,
			true
		);
	}

	return result();
}
