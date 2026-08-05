import { createSuite } from "./harness.mjs";
import { PlanOperations } from "./.build/callander.mjs";

export function run() {
	const { eq, result } = createSuite("plan costs & settling");

	const participants = ["Callan", "Riley", "Laura"];
	/** What the breakdown modal totals — settled lines are shown but excluded. */
	const modalTotal = (rows) =>
		rows.reduce((s, r) => (r.settled ? s : s + r.amount), 0);

	// ---------- costsOf parses `settled` ----------
	const parsed = PlanOperations.costsOf({
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
		PlanOperations.owedFor(
			{ label: "Airbnb", amount: 90, settled: true, split: { mode: "even" } },
			participants
		),
		{ Callan: 30, Riley: 30, Laura: 30 }
	);

	// ---------- split modes ----------
	eq(
		"even split divides equally",
		PlanOperations.owedFor(
			{ label: "X", amount: 90, split: { mode: "even" } },
			participants
		),
		{ Callan: 30, Riley: 30, Laura: 30 }
	);
	eq(
		"shares split by weight",
		PlanOperations.owedFor(
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
		PlanOperations.owedFor(
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
		PlanOperations.owedFor(
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
		PlanOperations.owedFor(
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
	const rows = PlanOperations.breakdownFor("Riley", costs, participants);
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
	const allRows = PlanOperations.breakdownFor("Riley", allSettled, participants);
	eq("all-settled still returns rows", allRows.length, 1);
	eq("all-settled total is zero", modalTotal(allRows), 0);

	// ---------- credits ----------
	const withCredit = PlanOperations.breakdownFor("Riley", costs, participants, [
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
		PlanOperations.creditTotalFor("Riley", [
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
	const wording = PlanOperations.breakdownFor("Riley", wordingCosts, participants);
	const descriptorFor = (label) =>
		wording.find((r) => r.label === label).descriptor;
	eq("even -> 'split evenly'", descriptorFor("Petrol"), "split evenly");
	eq("receipt -> 'by receipt'", descriptorFor("Dinner"), "by receipt");
	eq("value -> 'by value'", descriptorFor("Ferry"), "by value");
	eq("percent keeps the personal number", descriptorFor("Rent"), "25%");
	eq("shares keeps the personal count", descriptorFor("Gas"), "2 shares");

	return result();
}
