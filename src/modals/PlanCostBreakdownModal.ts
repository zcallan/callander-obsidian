import { App, Modal } from "obsidian";

/** Read-only: how one person's total splits across each expense. */
export class PlanCostBreakdownModal extends Modal {
	constructor(
		app: App,
		private person: string,
		private rows: Array<{
			label: string;
			descriptor: string;
			amount: number;
			settled?: boolean;
		}>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: `${this.person}’s share` });

		if (this.rows.length === 0) {
			contentEl.createDiv({
				cls: "section-helper-text",
				text: "Nothing owed.",
			});
			return;
		}

		const list = contentEl.createDiv({ cls: "plan-breakdown-list" });
		let total = 0;
		for (const r of this.rows) {
			// Settled lines are history — shown, but already squared up, so
			// they don't add to what's still owed.
			if (!r.settled) total += r.amount;
			const row = list.createDiv({ cls: "plan-breakdown-row" });
			row.createSpan({
				cls: "plan-breakdown-label",
				text: `${r.label} · ${r.descriptor}`,
			});
			if (r.settled) {
				row.createSpan({
					cls: "plan-breakdown-settled",
					text: "Settled",
				});
			}
			row.createSpan({
				cls: `plan-breakdown-amount${r.settled ? " is-settled" : ""}`,
				text: `$${r.amount.toFixed(2)}`,
			});
		}

		const totalRow = list.createDiv({
			cls: "plan-breakdown-row plan-breakdown-total",
		});
		totalRow.createSpan({
			cls: "plan-breakdown-label",
			text: "Total",
		});
		totalRow.createSpan({
			cls: "plan-breakdown-amount",
			text: `$${total.toFixed(2)}`,
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
