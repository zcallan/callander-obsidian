import type { Credit, Expense } from "@/types";
import {
	breakdownFor,
	formatMoney,
	isPaidBy,
	owedFor,
	payersOf,
	planOwedSummary,
	splitModeLabel,
} from "@/utils/expenseMath";

/**
 * A plan's costs as plain text, for pasting somewhere nobody has the vault.
 *
 * Three scopes share one builder because they share one question — who is
 * charged what — and only differ in how much of it is in frame: a single
 * expense, a single person, or the lot. Splitting them into three formatters
 * is how the same figure ends up rendered three ways.
 *
 * Kept pure and out of the modal so it can be exercised directly, and built
 * on the same `owedFor` / `breakdownFor` the screen reads, so a copied
 * message can't disagree with the page it came from.
 */

/** What the copied text carries. */
export interface ExpenseShareDetail {
	/** How each expense was divided — "split evenly", "2 shares". */
	split: boolean;
	/** Each person's own share under an expense. */
	people: boolean;
	/** The credits block. */
	credits: boolean;
	/** The per-person totals block. */
	totals: boolean;
	/**
	 * Leave out anything already square: a settled person's line, a wholly
	 * settled expense, and a person who owes nothing.
	 *
	 * Off by default — what has been paid is usually the point of sending
	 * the message, and somebody who has settled seeing themselves missing
	 * from the list reads as an error rather than as good news.
	 */
	hideSettled: boolean;
}

export const EXPENSE_SHARE_DEFAULTS: ExpenseShareDetail = {
	split: true,
	people: true,
	credits: true,
	totals: true,
	hideSettled: false,
};

/** Which toggles a scope offers — the rest have nothing to act on. */
export const EXPENSE_SHARE_FIELDS: {
	id: keyof ExpenseShareDetail;
	label: string;
}[] = [
	{ id: "split", label: "Split" },
	{ id: "people", label: "People" },
	{ id: "credits", label: "Credits" },
	{ id: "totals", label: "Totals" },
	{ id: "hideSettled", label: "Hide settled" },
];

export type ExpenseShareScope =
	| { kind: "expense"; index: number }
	| { kind: "person"; person: string }
	| { kind: "all" };

export interface ExpenseShareInput {
	scope: ExpenseShareScope;
	expenses: Expense[];
	credits: Credit[];
	participants: string[];
	yourName: string;
	/** The plan's name, for the whole-section copy. */
	title?: string;
}

/** The toggles that do anything in a given scope, in field order. */
export function shareFieldsFor(
	scope: ExpenseShareScope
): typeof EXPENSE_SHARE_FIELDS {
	const usable: Record<ExpenseShareScope["kind"], Array<keyof ExpenseShareDetail>> = {
		// One expense: no credits to list, and its own total is the amount.
		expense: ["split", "people", "hideSettled"],
		// One person: "people" is the person, and their total is the point.
		person: ["split", "credits", "totals", "hideSettled"],
		all: ["split", "people", "credits", "totals", "hideSettled"],
	};
	const allowed = usable[scope.kind];
	return EXPENSE_SHARE_FIELDS.filter((f) => allowed.includes(f.id));
}

export function buildExpenseShareText(
	input: ExpenseShareInput,
	detail: ExpenseShareDetail
): string {
	switch (input.scope.kind) {
		case "expense":
			return expenseText(input, input.scope.index, detail).join("\n");
		case "person":
			return personText(input, input.scope.person, detail).join("\n");
		default:
			return allText(input, detail).join("\n");
	}
}

/** "Dinner — $186.40 (by receipt)", plus each person's share beneath. */
function expenseText(
	input: ExpenseShareInput,
	index: number,
	detail: ExpenseShareDetail
): string[] {
	const cost = input.expenses[index];
	if (!cost) return [];
	const lines = [expenseHeading(cost, detail)];
	if (detail.people) {
		lines.push(...personLines(cost, input, detail));
	}
	return lines;
}

function expenseHeading(cost: Expense, detail: ExpenseShareDetail): string {
	const parts = [`${cost.label} — ${formatMoney(cost.amount)}`];
	if (detail.split) parts.push(`(${splitModeLabel(cost.split.mode).toLowerCase()})`);
	if (cost.settled) parts.push("— settled");
	return parts.join(" ");
}

/** Indented, so a person's share reads as belonging to the line above it. */
function personLines(
	cost: Expense,
	input: ExpenseShareInput,
	detail: ExpenseShareDetail
): string[] {
	const owed = owedFor(cost, input.participants);
	const lines: string[] = [];
	for (const person of payersOf(cost, input.participants)) {
		const settled = isPaidBy(cost, person);
		if (settled && detail.hideSettled) continue;
		lines.push(
			`  ${person} ${formatMoney(owed[person] ?? 0)}${
				settled ? " — settled" : ""
			}`
		);
	}
	return lines;
}

/** One person's ledger: their share of each cost, credits, what's left. */
function personText(
	input: ExpenseShareInput,
	person: string,
	detail: ExpenseShareDetail
): string[] {
	const rows = breakdownFor(
		person,
		input.expenses,
		input.participants,
		input.credits
	);
	const lines = [person, ""];

	for (const row of rows) {
		if (row.kind !== "expense") continue;
		if (row.settled && detail.hideSettled) continue;
		const parts = [row.label];
		if (detail.split) parts.push(`(${row.descriptor})`);
		parts.push(formatMoney(row.amount));
		if (row.settled) parts.push("— settled");
		lines.push(parts.join(" "));
	}

	const creditRows = rows.filter((r) => r.kind === "credit");
	if (detail.credits && creditRows.length > 0) {
		lines.push("", "Credits");
		for (const row of creditRows) {
			lines.push(`${row.descriptor} ${formatMoney(row.amount)}`);
		}
	}

	if (detail.totals) {
		// The same sum the ledger shows: settled lines are listed but don't
		// count, whether or not they were printed.
		const total = rows.reduce(
			(sum, r) => (r.settled ? sum : sum + r.amount),
			0
		);
		lines.push("", `${totalLabel(person, input.yourName)} ${formatMoney(total)}`);
	}
	return lines;
}

/** You can't owe yourself, so your own line says what it actually is. */
function totalLabel(person: string, yourName: string): string {
	const isYou = !!yourName && person.toLowerCase() === yourName.toLowerCase();
	return isYou ? "My total split" : "Total left to pay";
}

/** Every expense, every credit, and what each person is left owing. */
function allText(
	input: ExpenseShareInput,
	detail: ExpenseShareDetail
): string[] {
	const lines: string[] = [];
	if (input.title) lines.push(input.title, "");

	const shown = input.expenses.filter(
		(cost) => !(cost.settled && detail.hideSettled)
	);
	if (shown.length > 0) {
		lines.push("Expenses");
		for (const cost of shown) {
			lines.push(expenseHeading(cost, detail));
			if (detail.people) lines.push(...personLines(cost, input, detail));
		}
	}

	if (detail.credits && input.credits.length > 0) {
		lines.push("", "Credits");
		for (const credit of input.credits) {
			const note = credit.note ? ` (${credit.note})` : "";
			lines.push(
				`${credit.person} ${formatMoney(-credit.amount)}${note}`
			);
		}
	}

	if (detail.totals) {
		const { rows } = planOwedSummary(
			input.expenses,
			input.credits,
			input.participants,
			input.yourName,
			[]
		);
		const owing = rows.filter((r) => !(r.square && detail.hideSettled));
		if (owing.length > 0) {
			lines.push("", "Totals");
			for (const row of owing) {
				lines.push(`${row.person} ${formatMoney(row.net)}`);
			}
		}
	}

	return lines;
}
