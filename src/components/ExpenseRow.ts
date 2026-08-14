import type { Expense } from "@/types";
import styles from "./ExpenseRow.module.css";
import { paidStateOf, payersOf, splitModeLabel } from "@/utils/expenseMath";

export interface ExpenseRowOptions {
	/** Rendered as "Me" in the split — matches the read view's wording. */
	yourName?: string;
	onClick: () => void;
}

/**
 * One expense, over two lines: what it was and how far along it is, then
 * what it cost and how it divides.
 *
 *     Tents on Thurs              0 of 7 paid
 *     $428.82 · split evenly
 *
 * The tally on the right is the thing you scan a list of these for — how
 * much chasing is left — so it gets the corner your eye lands on rather
 * than trailing off the end of a sentence.
 *
 * Shared by the plan page and the dashboard, so an expense reads the same
 * in both.
 */
export function appendExpenseRow(
	container: HTMLElement,
	expense: Expense,
	participants: string[],
	options: ExpenseRowOptions
): HTMLElement {
	const { yourName = "", onClick } = options;
	const row = container.createDiv({ cls: styles.row });
	row.addEventListener("click", onClick);

	const top = row.createDiv({ cls: styles.line });
	top.createSpan({ cls: styles.label, text: expense.label });

	// Settled says it outright; otherwise count how many are square. An
	// expense that charges nobody has nothing to count, so it says nothing
	// rather than "0 of 0 paid".
	const payers = payersOf(expense, participants);
	if (expense.settled) {
		top.createSpan({
			cls: `${styles.status} ${styles.settled}`,
			text: "Settled",
		});
	} else if (payers.length > 0) {
		const paid = paidStateOf(expense, payers, yourName);
		top.createSpan({
			cls: styles.status,
			text: `${paid.length} of ${payers.length} paid`,
		});
	}

	const bottom = row.createDiv({ cls: styles.line });
	bottom.createSpan({
		cls: styles.meta,
		text: `$${expense.amount.toFixed(2)} · ${splitModeLabel(
			expense.split.mode
		).toLowerCase()}`,
	});

	return row;
}
