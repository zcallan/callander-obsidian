import { App, Modal, setIcon } from "obsidian";
import type { Expense } from "@/types";
import {
	isFullyPaid,
	owedFor,
	paidStateOf,
	payersOf,
	splitModeLabel,
} from "@/utils/expenseMath";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { shortenPeopleList } from "@/utils/nameFormat";

/**
 * A read view of one shared expense: what it was, how it's divided, and
 * what that works out to per person. Follows the same shape as the other
 * read views — Edit reopens the real form, Delete confirms first.
 */
export class ExpenseViewModal extends Modal {
	constructor(
		app: App,
		private cost: Expense,
		private participants: string[],
		private onEdit: () => void,
		private onDelete: () => Promise<void>,
		/** Rendered as "Me", so the split reads the way you'd say it. */
		private yourName = "",
		/** Persist the tick state and what it settles to, together. */
		private onUpdate: (changes: {
			paid: string[];
			settled: boolean;
		}) => Promise<void>,
		/** Per-friend shortenPeopleList overrides — see shortNameOverrides. */
		private shortNames: Map<string, string> = new Map()
	) {
		super(app);
	}

	private money(n: number): string {
		return `$${n.toFixed(2)}`;
	}

	/**
	 * Persist a new tick state and whatever it settles to, then redraw. The
	 * local copy is updated first so the redraw reflects the change even
	 * though the caller re-reads from disk on its own schedule.
	 */
	private async commit(paid: string[], settled: boolean) {
		this.cost.paid = paid;
		if (settled) this.cost.settled = true;
		else delete this.cost.settled;
		await this.onUpdate({ paid, settled });
		this.render();
	}

	onOpen() {
		this.render();
	}

	/** Its own method, not just onOpen's body — settling toggles in place
	 * without closing the modal, so it needs to redraw itself. */
	private render() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("someday-view-modal");
		const c = this.cost;

		contentEl.createDiv({ cls: "view-kind", text: "Expense" });
		contentEl.createEl("h2", { text: c.label });

		// Settled reads as done — the split mode no longer matters once
		// it's squared up, so the price itself carries the news instead.
		// Only the word is green; the amount still reads as a plain figure.
		if (c.settled) {
			const settledLine = contentEl.createDiv({
				cls: "someday-view-meta",
			});
			settledLine.createSpan({
				cls: "expense-settled-label",
				text: "Settled",
			});
			settledLine.createSpan({ text: ` • ${this.money(c.amount)}` });
		} else {
			contentEl.createDiv({
				cls: "someday-view-meta",
				text: `💵 ${this.money(c.amount)} · ${splitModeLabel(
					c.split.mode
				)}`,
			});
		}

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
		const owed = owedFor(c, this.participants);
		const paying = payersOf(c, this.participants);
		const paid = paidStateOf(c, paying, this.yourName);
		if (paying.length > 0) {
			const list = contentEl.createDiv({ cls: "expense-view-split" });
			for (const p of paying) {
				const row = list.createDiv({ cls: "expense-view-row" });

				// Tick someone off as they square up. The last tick settles
				// the whole expense, so the button is a shortcut rather than
				// the only way there.
				const check = row.createEl("input", {
					cls: "expense-view-check",
					attr: {
						type: "checkbox",
						"aria-label": `${p} has paid`,
					},
				});
				check.checked = paid.includes(p);
				check.addEventListener("click", (e) => e.stopPropagation());
				check.addEventListener("change", () => {
					const next = check.checked
						? [...paid, p]
						: paid.filter((x) => x !== p);
					void this.commit(next, isFullyPaid(next, paying));
				});

				const nameEl = row.createDiv({ cls: "expense-view-name" });
				nameEl.createSpan({
					text: shortenPeopleList(
						p,
						this.participants,
						this.yourName,
						this.shortNames
					),
				});
				// How their line was arrived at — "14 (7+7)" — so a wrong
				// figure or a missed item is findable later.
				const expr = c.split.exprs?.[p];
				const line = c.split.shares?.[p];
				if (expr && line !== undefined) {
					nameEl.createDiv({
						cls: "expense-view-working",
						text: `${line} (${expr})`,
					});
				}
				row.createSpan({
					cls: `expense-view-amount${
						paid.includes(p) ? " is-paid" : ""
					}`,
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

		const settle = actions.createEl("button", { cls: "callander-button" });
		setIcon(settle, c.settled ? "rotate-ccw" : "check-circle");
		// "all", not "as": this ticks every person on the expense, which is
		// the same wording the person ledger uses for the same action seen
		// from the other side.
		settle.createSpan({
			text: c.settled ? "Mark all unsettled" : "Mark all settled",
		});
		settle.addEventListener("click", () => {
			// Settling ticks everyone; unsettling clears them back to just
			// you, since marking it unsettled doesn't undo the fact that you
			// were the one who paid.
			const next = c.settled
				? paidStateOf({ ...c, paid: undefined, settled: false }, paying, this.yourName)
				: [...paying];
			void this.commit(next, !c.settled);
		});

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
