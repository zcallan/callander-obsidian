import { App, Modal, setIcon } from "obsidian";
import { formatMoney as money, type BreakdownRow } from "@/utils/expenseMath";

/**
 * One person's ledger for a plan: what they're charged for, what's come off
 * it, and what's left — with each line tickable as it's squared up.
 *
 * Grouped under the same sub-headings the plan's own list uses, so opening
 * this reads as a zoom into the row you tapped rather than a different
 * screen. Expenses count toward what they owe; credits — things they
 * covered that were never logged as an expense — come off it.
 *
 * Settled lines stay listed rather than disappearing. They're the record of
 * what was squared up, and "why is this lower than I remember" is the
 * question this exists to answer — so they're shown ticked and struck
 * through, and left out of the total.
 *
 * `rows` is a function, not an array: ticking a line writes to the vault and
 * the modal redraws itself over the result, the same way the expense's own
 * view modal does.
 */
export class ExpenseBreakdownModal extends Modal {
	constructor(
		app: App,
		private person: string,
		private rows: () => BreakdownRow[],
		private options: {
			/**
			 * Your own row. You can't owe yourself, so the ledger drops the
			 * ticks and totals up as what your own share of the trip came
			 * to rather than as anything outstanding.
			 */
			isYou: boolean;
			onSetPaid: (index: number, paid: boolean) => Promise<void>;
			onSettleAll: (settled: boolean) => Promise<void>;
		}
	) {
		super(app);
	}

	onOpen() {
		this.render();
	}

	/** Its own method: ticking a line redraws in place without closing. */
	private render() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("expense-ledger-modal");

		const rows = this.rows();
		contentEl.createEl("h2", {
			text: this.person,
			cls: "expense-breakdown-who",
		});

		if (rows.length === 0) {
			contentEl.createDiv({
				cls: "section-helper-text",
				text: "Nothing on this plan for them yet.",
			});
			return;
		}

		const expenses = rows.filter((r) => r.kind === "expense");
		const credits = rows.filter((r) => r.kind === "credit");
		// Settled lines are shown but already square, so they don't count.
		const total = rows.reduce(
			(sum, r) => (r.settled ? sum : sum + r.amount),
			0
		);

		const ledger = contentEl.createDiv({ cls: "expense-ledger" });
		if (expenses.length > 0) this.group(ledger, "Expenses", expenses);
		// Only when there are any — a heading over nothing is worse than no
		// heading, and most people on most plans have no credits at all.
		if (credits.length > 0) this.group(ledger, "Credits", credits);

		const totalRow = ledger.createDiv({
			cls: "expense-ledger-row expense-ledger-total",
		});
		totalRow.createSpan({
			cls: "expense-ledger-label",
			text: this.options.isYou ? "My total split" : "Total left to pay",
		});
		totalRow.createSpan({
			cls: "expense-ledger-amount",
			text: money(total),
		});

		// Nothing to settle on your own row, and nothing to settle when the
		// person is charged for nothing.
		if (!this.options.isYou && expenses.length > 0) {
			this.appendSettleAll(expenses);
		}
	}

	private group(parent: HTMLElement, heading: string, rows: BreakdownRow[]) {
		parent.createDiv({ cls: "callander-subheading", text: heading });
		for (const r of rows) {
			const row = parent.createDiv({ cls: "expense-ledger-row" });

			// Credits have nothing to tick — they aren't a debt of theirs,
			// they're a cost of yours. The column still holds their line in
			// step with the expenses above.
			if (r.kind === "expense" && !this.options.isYou) {
				const check = row.createEl("input", {
					cls: "expense-ledger-check",
					attr: {
						type: "checkbox",
						"aria-label": `${this.person} has settled ${r.label}`,
					},
				});
				check.checked = !!r.settled;
				check.addEventListener("change", () => {
					if (r.index === undefined) return;
					void this.write(
						this.options.onSetPaid(r.index, check.checked)
					);
				});
			} else {
				row.createDiv({ cls: "expense-ledger-check-spacer" });
			}

			const label = row.createDiv({ cls: "expense-ledger-label" });
			// A credit's own label is the word "Credit", which the heading
			// above already says — so its note carries the line by itself.
			if (r.kind === "expense") {
				label.createSpan({
					cls: "expense-ledger-name",
					text: r.label,
				});
				label.createDiv({
					cls: "expense-ledger-how",
					text: r.descriptor,
				});
			} else {
				label.appendText(r.descriptor);
			}

			row.createSpan({
				cls: `expense-ledger-amount${r.settled ? " is-settled" : ""}${
					r.kind === "credit" ? " is-credit" : ""
				}`,
				text: money(r.amount),
			});
		}
	}

	/**
	 * One action for the whole person. Reverses once everything is ticked,
	 * so a mis-tap is undone the same way it was made rather than by
	 * unticking each line.
	 */
	private appendSettleAll(expenses: BreakdownRow[]) {
		const allSettled = expenses.every((r) => r.settled);
		const actions = this.contentEl.createDiv({
			cls: "expense-ledger-actions",
		});
		const button = actions.createEl("button", {
			cls: "callander-button button-full-width",
		});
		setIcon(button, allSettled ? "rotate-ccw" : "check");
		button.createSpan({
			text: allSettled ? "Mark all unsettled" : "Mark all settled",
		});
		button.addEventListener("click", () => {
			void this.write(this.options.onSettleAll(!allSettled));
		});
	}

	/** Persist, then redraw over whatever the vault now says. */
	private async write(pending: Promise<void>) {
		await pending;
		this.render();
	}

	onClose() {
		this.contentEl.empty();
	}
}
