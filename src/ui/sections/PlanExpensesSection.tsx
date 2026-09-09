import type { Credit, Expense } from "@/types";
import {
	breakdownFor,
	formatMoney as money,
	planOwedSummary,
	type OwedRow,
} from "@/utils/expenseMath";
import { ExpenseRow } from "@/ui/components/ExpenseRow";
import { Icon } from "@/ui/components/Icon";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";

/**
 * One person's line: what they owe, and whether they're square.
 *
 * The whole row opens their ledger, and the box is an indicator rather than
 * a control. Settling is per-expense now, and lives in the ledger — a tick
 * out here could only have said "done" without making the figure beside it
 * agree, which is exactly the thing that used to leave a struck-through row
 * still reading $87.50.
 */
function OwedPersonRow({
	row,
	breakdownCount,
	onBreakdown,
}: {
	row: OwedRow;
	breakdownCount: number;
	onBreakdown: (person: string) => void;
}) {
	const canOpen = breakdownCount > 0;

	return (
		<div
			className={`expense-owed-row${row.done ? " paid" : ""}${
				row.isYou ? " is-you" : ""
			}${canOpen ? " is-clickable" : ""}`}
			onClick={() => {
				if (canOpen) onBreakdown(row.person);
			}}
		>
			<span className="expense-owed-check">
				<input
					type="checkbox"
					tabIndex={-1}
					aria-hidden="true"
					checked={row.done}
					disabled
					readOnly
				/>
				<span className="expense-owed-name">
					{row.isYou ? `${row.person} (Me)` : row.person}
				</span>
			</span>
			<span className="expense-owed-amount">{money(row.net)}</span>
			{/* Gated on having something to list rather than on the amount:
			    once everything of theirs is settled they owe nothing, but the
			    settled lines are exactly what you'd open this to check. */}
			{canOpen && (
				// chevron-down turned on its side. `chevron-right` is not on
				// the verified list in CLAUDE.md, and setIcon renders nothing
				// at all for a name Obsidian doesn't ship — a rotation is a
				// cheaper certainty than a blank button.
				<Icon name="chevron-down" className="expense-owed-chevron" />
			)}
		</div>
	);
}

/**
 * A sub-heading inside the cost breakdown — "Expenses", "Credits", "Who
 * owes what" — with an optional figure held out to the right.
 *
 * The section runs three lists of different things back to back, and
 * without these it reads as one list where some rows happen to be green.
 */
function SubHeading({ text, trailing }: { text: string; trailing?: string }) {
	return (
		<div className="callander-subheading">
			<span>{text}</span>
			{trailing && (
				<span className="callander-subheading-trailing">
					{trailing}
				</span>
			)}
		</div>
	);
}

/**
 * Something the person covered that was never logged as an expense — their
 * share of the petrol, say — taken off what they owe.
 *
 * Laid out like an expense row rather than beside one: the note reads on
 * the left and the figure lands in the same right-hand column as an
 * expense's tally, which is what lets the column be scanned at all.
 */
function CreditRow({
	credit,
	onClick,
}: {
	credit: Credit;
	onClick: () => void;
}) {
	return (
		<div className="plan-credit-row" onClick={onClick}>
			<span className="plan-credit-text">
				<strong>{credit.person}</strong>
				{credit.note ? ` · ${credit.note}` : ""}
			</span>
			<span className="plan-credit-amount">{money(-credit.amount)}</span>
		</div>
	);
}

/**
 * The plan's cost breakdown: what was spent, what's been handed back, and
 * who still owes what.
 *
 * Note what this no longer needs. The imperative version updated the total
 * and the row's class in place, because a full re-render collapsed the
 * open accordion back to closed. React reconciles rather than replacing, so
 * the `<details>` keeps its state and the hack is gone.
 */
export function PlanExpensesSection({
	store,
	costs,
	credits,
	participants,
	yourName,
	paid,
	onOpenCost,
	onOpenCredit,
	onBreakdown,
	onAddExpense,
	onAddCredit,
}: {
	store: ViewStore;
	costs: () => Expense[];
	credits: () => Credit[];
	participants: () => string[];
	/** A function for the same reason the lists are — see viewStore. */
	yourName: () => string;
	paid: () => string[];
	onOpenCost: (index: number, cost: Expense) => void;
	onOpenCredit: (index: number, credit: Credit) => void;
	onBreakdown: (person: string) => void;
	onAddExpense: () => void;
	onAddCredit: () => void;
}) {
	useViewRevision(store);
	const costList = costs();
	const creditList = credits();
	const people = participants();
	const me = yourName();
	const { rows, outstanding } = planOwedSummary(
		costList,
		creditList,
		people,
		me,
		paid()
	);

	const outstandingRows = rows.filter((r) => !r.square);
	const settledRows = rows.filter((r) => r.square);
	const showSummary =
		(costList.length > 0 || creditList.length > 0) && people.length > 0;
	const creditPeople = people.filter(
		(p) => !me || p.toLowerCase() !== me.toLowerCase()
	);

	const personRow = (row: OwedRow) => (
		<OwedPersonRow
			key={row.person}
			row={row}
			breakdownCount={
				breakdownFor(row.person, costList, people, creditList).length
			}
			onBreakdown={onBreakdown}
		/>
	);

	return (
		<div className="contact-ideas-section plan-items-section">
			{costList.length === 0 && creditList.length === 0 && (
				<div className="section-helper-text">
					Split the costs — who paid for what, and who still owes.
				</div>
			)}

			{costList.length > 0 && <SubHeading text="Expenses" />}
			{costList.map((cost, index) => (
				<ExpenseRow
					key={index}
					expense={cost}
					participants={people}
					yourName={me}
					onClick={() => onOpenCost(index, cost)}
				/>
			))}

			{/* Their own heading rather than trailing the expenses: a credit
			    is money coming off, and interleaved with costs it read as one
			    more cost that happened to be green. */}
			{creditList.length > 0 && <SubHeading text="Credits" />}
			{creditList.map((credit, index) => (
				<CreditRow
					key={index}
					credit={credit}
					onClick={() => onOpenCredit(index, credit)}
				/>
			))}

			{showSummary && (
				<>
					{/* No longer behind a disclosure. The summary line existed
					    to hold the total while the list was hidden, and the
					    heading carries it now — so opening it bought nothing
					    but a tap. */}
					<SubHeading
						text="Who owes what"
						trailing={`${money(outstanding)} left`}
					/>

					{/* Each list bands independently, which is what lets plain
					    :nth-child do it — nothing is hidden inside either. */}
					<div className="expense-owed-list">
						{outstandingRows.map(personRow)}
					</div>

					{settledRows.length > 0 && (
						<details className="expense-settled-group">
							<summary className="expense-settled-summary">
								<Icon
									name="chevron-down"
									className="expense-settled-chevron"
								/>
								<span>Show settled people</span>
							</summary>
							<div className="expense-owed-list">
								{settledRows.map(personRow)}
							</div>
						</details>
					)}
				</>
			)}

			<div className="contact-section-footer expense-footer">
				<button className="callander-button" onClick={onAddExpense}>
					<Icon name="plus" />
					<span>Add expense</span>
				</button>
				{creditPeople.length > 0 && (
					<button className="callander-button" onClick={onAddCredit}>
						<Icon name="plus" />
						<span>Add credit</span>
					</button>
				)}
			</div>
		</div>
	);
}
