import { App, Modal, setIcon } from "obsidian";
import type { PlanCost } from "@/types";
import { PlanOperations } from "@/services/PlanOperations";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { shortenPeopleList, splitModeLabel } from "@/utils/planFormat";

/**
 * A read view of one shared expense: what it was, how it's divided, and
 * what that works out to per person. Mirrors PlanTimelineViewModal —
 * Edit reopens the real form, Delete confirms first.
 */
export class PlanCostViewModal extends Modal {
	constructor(
		app: App,
		private cost: PlanCost,
		private participants: string[],
		private onEdit: () => void,
		private onDelete: () => Promise<void>,
		/** Rendered as "Me", so the split reads the way you'd say it. */
		private yourName = ""
	) {
		super(app);
	}

	private money(n: number): string {
		return `$${n.toFixed(2)}`;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("someday-view-modal");
		const c = this.cost;

		contentEl.createDiv({ cls: "plan-view-kind", text: "Expense" });
		contentEl.createEl("h2", { text: c.label });

		contentEl.createDiv({
			cls: "someday-view-meta",
			text: `💵 ${this.money(c.amount)} · ${splitModeLabel(
				c.split.mode
			)}`,
		});

		// Receipt add-ons, when either was applied. Both are charged on the
		// subtotal, so they're listed rather than folded into one figure.
		if (c.split.mode === "receipt") {
			const addOns: string[] = [];
			if (c.split.tax !== undefined) addOns.push(`Tax ${c.split.tax}%`);
			if (c.split.tip !== undefined) addOns.push(`Tip ${c.split.tip}%`);
			if (addOns.length > 0) {
				contentEl.createDiv({
					cls: "someday-view-meta",
					text: `🧾 ${addOns.join(" · ")}`,
				});
			}
		}

		// What it actually works out to — the reason to open this at all.
		const owed = PlanOperations.owedFor(c, this.participants);
		const paying = this.participants.filter((p) => (owed[p] ?? 0) > 0);
		if (paying.length > 0) {
			const list = contentEl.createDiv({ cls: "plan-cost-view-split" });
			for (const p of paying) {
				const row = list.createDiv({ cls: "plan-cost-view-row" });
				const nameEl = row.createDiv({ cls: "plan-cost-view-name" });
				nameEl.createSpan({
					text: shortenPeopleList(p, this.participants, this.yourName),
				});
				// How their line was arrived at — "14 (7+7)" — so a wrong
				// figure or a missed item is findable later.
				const expr = c.split.exprs?.[p];
				const line = c.split.shares?.[p];
				if (expr && line !== undefined) {
					nameEl.createDiv({
						cls: "plan-cost-view-working",
						text: `${line} (${expr})`,
					});
				}
				row.createSpan({
					cls: "plan-cost-view-amount",
					text: this.money(owed[p]),
				});
			}
		} else {
			contentEl.createDiv({
				cls: "section-helper-text",
				text: "Nobody's assigned a share of this yet.",
			});
		}

		contentEl.createDiv({ cls: "someday-view-divider" });

		const actions = contentEl.createDiv({ cls: "someday-view-actions" });

		const edit = actions.createEl("button", { cls: "callander-button" });
		setIcon(edit, "pencil");
		edit.createSpan({ text: "Edit" });
		edit.addEventListener("click", () => {
			this.close();
			this.onEdit();
		});

		const del = actions.createEl("button", {
			cls: "callander-button button-icon button-danger",
			attr: { "aria-label": "Delete" },
		});
		setIcon(del, "trash");
		del.addEventListener("click", () => {
			new ConfirmModal(
				this.app,
				"Delete expense",
				`Delete "${c.label}"?`,
				"Delete",
				async () => {
					await this.onDelete();
					this.close();
				}
			).open();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
