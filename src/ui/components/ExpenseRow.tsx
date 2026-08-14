import type { Expense } from "@/types";
import { paidStateOf, payersOf, splitModeLabel } from "@/utils/expenseMath";
import styles from "@/components/ExpenseRow.module.css";

/**
 * One expense, over two lines — the React twin of components/ExpenseRow.ts.
 *
 * Deliberately sharing that file's stylesheet rather than copying it: the
 * plan page still renders the imperative version, and two stylesheets for
 * one visual component is exactly how they drift. When the plan page moves
 * across, the imperative builder goes and this keeps the CSS.
 */
export function ExpenseRow({
	expense,
	participants,
	yourName = "",
	onClick,
}: {
	expense: Expense;
	participants: string[];
	yourName?: string;
	onClick: () => void;
}) {
	const payers = payersOf(expense, participants);
	const paid = paidStateOf(expense, payers, yourName);

	return (
		<div className={styles.row} onClick={onClick}>
			<div className={styles.line}>
				<span className={styles.label}>{expense.label}</span>
				{expense.settled ? (
					<span className={`${styles.status} ${styles.settled}`}>
						Settled
					</span>
				) : (
					// An expense that charges nobody has nothing to count, so
					// it says nothing rather than "0 of 0 paid".
					payers.length > 0 && (
						<span className={styles.status}>
							{paid.length} of {payers.length} paid
						</span>
					)
				)}
			</div>
			<div className={styles.line}>
				<span className={styles.meta}>
					${expense.amount.toFixed(2)} ·{" "}
					{splitModeLabel(expense.split.mode).toLowerCase()}
				</span>
			</div>
		</div>
	);
}
