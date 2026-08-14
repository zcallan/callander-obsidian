import { useCallback } from "react";
import type { Expense } from "@/types";
import { partitionExpenses } from "@/utils/expenseMath";
import { resolvePeopleNames } from "@/utils/people";
import { shortNameOverrides } from "@/utils/nameFormat";
import { ExpenseModal } from "@/modals/ExpenseModal";
import { ExpenseViewModal } from "@/modals/ExpenseViewModal";
import { usePlugin } from "@/ui/PluginContext";
import { useVaultQuery } from "@/ui/useVaultData";
import { Icon } from "@/ui/components/Icon";
import { ExpenseRow } from "@/ui/components/ExpenseRow";
import styles from "./ExpensesSection.module.css";

const EMPTY: Expense[] = [];

/**
 * Ad-hoc expenses, at the foot of the dashboard.
 *
 * The first section ported to React, chosen because it's self-contained: it
 * owns one frontmatter key, has no cross-section state, and its maths
 * (`partitionExpenses`, `payersOf`, `paidStateOf`) is already pure and
 * already tested. None of that logic moves — only the rendering does, which
 * is the whole bet of this migration.
 *
 * Note what isn't here any more: no manual re-render calls, no scroll
 * save/restore, and no update-in-place path for the settled accordion. A
 * write bumps the vault version, this re-renders, and React keeps the open
 * `<details>` open because it reconciles rather than replaces.
 */
export function ExpensesSection() {
	const plugin = usePlugin();
	const ops = plugin.contactOperations;

	const expenses = useVaultQuery(() => ops.getExpenses(), EMPTY);
	const contacts = useVaultQuery(() => ops.getContacts(), []);

	const sourcePath = ops.getDashboardFilePath();
	const yourName = plugin.settings.yourName;
	const shortNames = shortNameOverrides(contacts);

	/**
	 * Who an expense is scored against: whoever it names, plus you. Resolved
	 * per expense, since each carries its own people.
	 */
	const participantsFor = useCallback(
		(expense: Expense): string[] => {
			const picked = resolvePeopleNames(
				plugin.app,
				sourcePath,
				expense.people ?? []
			);
			const you = yourName.trim();
			return you &&
				!picked.some((p) => p.toLowerCase() === you.toLowerCase())
				? [you, ...picked]
				: picked;
		},
		[plugin.app, sourcePath, yourName]
	);

	// No `await this.refresh()` after these: the write fires a vault event,
	// which bumps the version, which re-renders whatever is subscribed.
	const saveAt = (index: number, updated: Expense) =>
		ops.writeExpenses((list) => {
			list[index] = updated;
		});

	const deleteAt = (index: number) =>
		ops.writeExpenses((list) => {
			list.splice(index, 1);
		});

	const edit = (index: number, expense: Expense) => {
		new ExpenseModal(
			plugin.app,
			participantsFor(expense),
			expense,
			(updated) => saveAt(index, updated),
			() => deleteAt(index),
			yourName,
			plugin.settings.receiptTaxPercent,
			plugin.settings.receiptTipPercent,
			{ contacts, sourcePath }
		).open();
	};

	const openView = (index: number, expense: Expense) => {
		new ExpenseViewModal(
			plugin.app,
			expense,
			participantsFor(expense),
			() => edit(index, expense),
			() => deleteAt(index),
			yourName,
			async ({ paid, settled }) => {
				await ops.writeExpenses((list) => {
					const current = list[index];
					if (!current) return;
					current.paid = paid;
					if (settled) current.settled = true;
					else delete current.settled;
				});
			},
			shortNames
		).open();
	};

	const add = () => {
		new ExpenseModal(
			plugin.app,
			yourName ? [yourName] : [],
			null,
			(expense) => ops.writeExpenses((list) => list.push(expense)),
			undefined,
			yourName,
			plugin.settings.receiptTaxPercent,
			plugin.settings.receiptTipPercent,
			{ contacts, sourcePath }
		).open();
	};

	const { open, settled } = partitionExpenses(expenses);

	return (
		<div className="dashboard-section">
			<h3>💵 Expenses</h3>

			{expenses.length === 0 && (
				<div className="section-helper-text">
					Split a one-off cost — dinner, a taxi, the groceries.
					Divide it evenly, by shares, or line by line off the
					receipt.
				</div>
			)}

			{open.map(({ expense, index }) => (
				<ExpenseRow
					key={index}
					expense={expense}
					participants={participantsFor(expense)}
					yourName={yourName}
					onClick={() => openView(index, expense)}
				/>
			))}

			{settled.length > 0 && (
				<details className={styles.settledGroup}>
					<summary className={styles.settledSummary}>
						<Icon name="chevron-down" className={styles.chevron} />
						<span>Settled ({settled.length})</span>
					</summary>
					{settled.map(({ expense, index }) => (
						<ExpenseRow
							key={index}
							expense={expense}
							participants={participantsFor(expense)}
							yourName={yourName}
							onClick={() => openView(index, expense)}
						/>
					))}
				</details>
			)}

			<div className={`contact-section-footer ${styles.footer}`}>
				<button className="callander-button" onClick={add}>
					<Icon name="plus" />
					<span>New expense</span>
				</button>
			</div>
		</div>
	);
}
