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
		}>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: `${this.person}’s share` });

		if (this.rows.length === 0) {
			contentEl.createEl("div", {
				cls: "section-helper-text",
				text: "Nothing owed.",
			});
			return;
		}

		const list = contentEl.createEl("div", { cls: "plan-breakdown-list" });
		let total = 0;
		for (const r of this.rows) {
			total += r.amount;
			const row = list.createEl("div", { cls: "plan-breakdown-row" });
			row.createEl("span", {
				cls: "plan-breakdown-label",
				text: `${r.label} · ${r.descriptor}`,
			});
			row.createEl("span", {
				cls: "plan-breakdown-amount",
				text: `$${r.amount.toFixed(2)}`,
			});
		}

		const totalRow = list.createEl("div", {
			cls: "plan-breakdown-row plan-breakdown-total",
		});
		totalRow.createEl("span", {
			cls: "plan-breakdown-label",
			text: "Total",
		});
		totalRow.createEl("span", {
			cls: "plan-breakdown-amount",
			text: `$${total.toFixed(2)}`,
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
