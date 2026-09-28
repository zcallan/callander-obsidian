import type { Expense } from "@/types";
import { paidStateOf, payersOf, splitModeLabel } from "@/utils/expenseMath";
import styles from "@/ui/components/ExpenseRow.module.css";

/**
 * One expense, over two lines: its label and how much of it is paid, then
 * its amount and how it's split. The same row on the dashboard and in a
 * plan's Cost breakdown.
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
