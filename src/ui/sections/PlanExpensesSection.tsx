import type { Credit, Expense } from "@/types";
import {
	breakdownFor,
	planOwedSummary,
	type OwedRow,
} from "@/utils/expenseMath";
import { ExpenseRow } from "@/ui/components/ExpenseRow";
import { Icon } from "@/ui/components/Icon";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";

const money = (n: number) =>
	`${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;

/** One person's line: tick when they've paid, with a breakdown to check. */
function OwedPersonRow({
	row,
	breakdownCount,
	onTogglePaid,
	onBreakdown,
}: {
	row: OwedRow;
	breakdownCount: number;
	onTogglePaid: (person: string, done: boolean) => void;
	onBreakdown: (person: string) => void;
}) {
	// You can't owe yourself, and there's nothing to tick off someone who
	// owes nothing — both stay read-only.
	const locked = row.isYou || row.square;

	return (
		<div
			className={`expense-owed-row${row.done ? " paid" : ""}${
				locked ? "" : " is-clickable"
			}`}
			onClick={(e) => {
				if (locked) return;
				// The label toggles natively and Breakdown opens a modal —
				// forwarding either would undo or hijack it. Everything else
				// (the row's padding, the space by the amount) would
				// otherwise be dead to a click.
				const target = e.target as HTMLElement | null;
				if (target?.closest("label, button")) return;
				onTogglePaid(row.person, !row.done);
			}}
		>
			<label className={`expense-owed-check${locked ? " is-disabled" : ""}`}>
				<input
					type="checkbox"
					aria-label={`Mark ${row.person} paid`}
					checked={row.done}
					disabled={locked}
					onChange={(e) =>
						onTogglePaid(row.person, e.currentTarget.checked)
					}
				/>
				<span className="expense-owed-name">
					{row.isYou ? `${row.person} (Me)` : row.person}
				</span>
			</label>
			<span className="expense-owed-amount">{money(row.net)}</span>
			{/* Always shown, disabled when they're in no expense at all.
			    Gated on having something to list rather than on the amount:
			    once everything of theirs is settled they owe nothing, but the
			    settled lines are exactly what you'd open this to check. */}
			<button
				className="callander-button expense-breakdown-btn"
				disabled={breakdownCount === 0}
				onClick={() => onBreakdown(row.person)}
			>
				Breakdown
			</button>
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
	onTogglePaid,
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
	onTogglePaid: (person: string, done: boolean) => void;
	onBreakdown: (person: string, rows: ReturnType<typeof breakdownFor>) => void;
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
			onTogglePaid={onTogglePaid}
			onBreakdown={(person) =>
				onBreakdown(
					person,
					breakdownFor(person, costList, people, creditList)
				)
			}
		/>
	);

	return (
		<div className="contact-ideas-section plan-items-section">
			{costList.length === 0 && creditList.length === 0 && (
				<div className="section-helper-text">
					Split the costs — who paid for what, and who still owes.
				</div>
			)}

			{costList.map((cost, index) => (
				<ExpenseRow
					key={index}
					expense={cost}
					participants={people}
					yourName={me}
					onClick={() => onOpenCost(index, cost)}
				/>
			))}

			{/* Money already handed over, shown after the expenses. */}
			{creditList.map((credit, index) => (
				<div
					key={index}
					className="contact-idea-item expense-row plan-credit-row plan-clickable-row"
					onClick={() => onOpenCredit(index, credit)}
				>
					<div className="contact-idea-text">
						<span className="expense-label">{`↩ ${credit.person}`}</span>
						<span className="item-cost plan-credit-amount">
							{` · ${money(-credit.amount)}${
								credit.note ? ` · ${credit.note}` : ""
							}`}
						</span>
					</div>
				</div>
			))}

			{showSummary && (
				// Collapsed by default — expand to see who owes what.
				<details className="expense-summary">
					<summary className="expense-summary-total">
						<span>{`Who owes what · ${money(
							outstanding
						)} left`}</span>
					</summary>

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
				</details>
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
