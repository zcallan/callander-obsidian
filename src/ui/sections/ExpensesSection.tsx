import { useCallback } from "react";
import { Notice } from "obsidian";
import type { Expense } from "@/types";
import type { ContactOperations } from "@/services/ContactOperations";
import { locateExpense, partitionExpenses } from "@/utils/expenseMath";
import { resolvePeopleNames } from "@/utils/people";
import { shortNameOverrides } from "@/utils/nameFormat";
import { ExpenseModal } from "@/modals/ExpenseModal";
import { ExpenseViewModal } from "@/modals/ExpenseViewModal";
import { usePlugin } from "@/ui/PluginContext";
import { useVaultQuery } from "@/ui/useVaultData";
import { Icon } from "@/ui/components/Icon";
import { ExpenseRow } from "@/ui/components/ExpenseRow";
import styles from "@/ui/sections/ExpensesSection.module.css";

const EMPTY: Expense[] = [];

/**
 * Writes to one expense for as long as a modal has it open. It's found by
 * what it held as well as where it sat (locateExpense): the list can change
 * under an open modal — a sync, another window — and writing by position
 * alone would change or delete whichever expense had moved into that place.
 * If it has changed or gone, nothing is written.
 *
 * Keeps its own copy, updated after each write, because the view modal edits
 * the object it was given in place before it saves.
 *
 * Nothing re-renders by hand after these: the write fires a vault event,
 * which bumps the version, which re-renders whatever is subscribed.
 */
function expenseEditor(
	ops: ContactOperations,
	index: number,
	opened: Expense
) {
	let known = structuredClone(opened);
	const write = async (
		change: (list: Expense[], at: number) => Expense | null
	) => {
		let found = true;
		await ops.writeExpenses((list) => {
			const at = locateExpense(list, index, known);
			if (at === -1) {
				found = false;
				return;
			}
			const next = change(list, at);
			if (next) known = structuredClone(next);
		});
		if (!found) {
			new Notice(
				"That expense changed or was removed since you opened it, so nothing was saved."
			);
		}
	};
	return {
		/** The expense as last written here. */
		current: () => structuredClone(known),
		save: (updated: Expense) =>
			write((list, at) => {
				list[at] = updated;
				return updated;
			}),
		remove: () =>
			write((list, at) => {
				list.splice(at, 1);
				return null;
			}),
		setPaid: ({ paid, settled }: { paid: string[]; settled: boolean }) =>
			write((list, at) => {
				const current = list[at];
				current.paid = paid;
				if (settled) current.settled = true;
				else delete current.settled;
				return current;
			}),
	};
}

type ExpenseEditor = ReturnType<typeof expenseEditor>;

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

	const edit = (editor: ExpenseEditor) => {
		const expense = editor.current();
		new ExpenseModal(
			plugin.app,
			participantsFor(expense),
			expense,
			(updated) => editor.save(updated),
			() => editor.remove(),
			yourName,
			(plugin.settings.receiptTaxEnabled ? plugin.settings.receiptTaxPercent : null),
			(plugin.settings.receiptTipEnabled ? plugin.settings.receiptTipPercent : null),
			{ contacts, sourcePath }
		).open();
	};

	const openView = (index: number, expense: Expense) => {
		const editor = expenseEditor(ops, index, expense);
		new ExpenseViewModal(
			plugin.app,
			expense,
			participantsFor(expense),
			// The same editor, so a save after ticking boxes here finds the
			// expense as those ticks left it.
			() => edit(editor),
			() => editor.remove(),
			yourName,
			(changes) => editor.setPaid(changes),
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
			(plugin.settings.receiptTaxEnabled ? plugin.settings.receiptTaxPercent : null),
			(plugin.settings.receiptTipEnabled ? plugin.settings.receiptTipPercent : null),
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
