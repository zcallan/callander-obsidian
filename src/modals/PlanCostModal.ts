import { App, Modal } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type { PlanCost } from "@/types";
import { PlanOperations } from "@/services/PlanOperations";

/**
 * Add/edit a shared expense: a label, an amount, who's splitting it, and
 * how — evenly, by integer shares (nights, drinks…), or by explicit
 * percent. Each mode keeps its own values so switching never bleeds.
 */
export class PlanCostModal extends FormModal {
	private mode: "even" | "shares" | "percent";
	private included: Set<string>;
	private weights: Record<string, number> = {};
	private percents: Record<string, number> = {};

	constructor(
		app: App,
		private participants: string[],
		private initial: PlanCost | null,
		private onSubmit: (cost: PlanCost) => Promise<void>,
		private onDelete?: () => Promise<void>,
		defaultParticipant?: string
	) {
		super(app);
		this.mode = initial?.split.mode ?? "even";
		const sh = initial?.split.shares ?? {};
		if (initial?.split.mode === "shares") this.weights = { ...sh };
		if (initial?.split.mode === "percent") this.percents = { ...sh };
		// Included: whoever the saved split names, else just you by default
		if (Object.keys(sh).length > 0) {
			this.included = new Set(this.participants.filter((p) => sh[p]));
		} else {
			const you =
				defaultParticipant &&
				this.participants.includes(defaultParticipant)
					? defaultParticipant
					: this.participants[0];
			this.included = new Set(you ? [you] : []);
		}
	}

	private includedList(): string[] {
		return this.participants.filter((p) => this.included.has(p));
	}

	private buildShares(): Record<string, number> | undefined {
		const inc = this.includedList();
		if (inc.length === 0) return undefined;
		if (this.mode === "percent") {
			const s: Record<string, number> = {};
			for (const p of inc) if (this.percents[p]) s[p] = this.percents[p];
			return Object.keys(s).length ? s : undefined;
		}
		if (this.mode === "shares") {
			const s: Record<string, number> = {};
			for (const p of inc) s[p] = this.weights[p] || 1;
			return s;
		}
		// even — omit when everyone's in (so new members auto-join)
		if (inc.length === this.participants.length) return undefined;
		const s: Record<string, number> = {};
		for (const p of inc) s[p] = 1;
		return s;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.initial ? "Edit expense" : "Add expense",
		});

		const labelField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		labelField.createEl("label", { text: "What" });
		const labelInput = labelField.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "text", placeholder: "e.g. Airbnb" },
		});
		labelInput.value = this.initial?.label ?? "";

		const amountField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		amountField.createEl("label", { text: "Total amount ($)" });
		const amountInput = amountField.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "number", min: "0", placeholder: "0" },
		});
		if (this.initial) amountInput.value = String(this.initial.amount);

		const modeRow = contentEl.createDiv({
			cls: "quick-idea-categories",
		});
		const modeButtons = new Map<string, HTMLButtonElement>();
		const sharesWrap = contentEl.createDiv({
			cls: "plan-cost-shares",
		});
		(
			[
				["even", "Split evenly"],
				["percent", "By percent"],
				["shares", "By shares"],
			] as Array<["even" | "shares" | "percent", string]>
		).forEach(([id, label]) => {
			const button = modeRow.createEl("button", {
				cls: `quick-idea-category-button ${
					this.mode === id ? "selected" : ""
				}`,
			});
			button.createSpan({ text: label });
			button.addEventListener("click", () => {
				this.mode = id;
				modeButtons.forEach((el, m) =>
					el.toggleClass("selected", m === id)
				);
				renderShares();
			});
			modeButtons.set(id, button);
		});

		// Percent mode: fields you've edited are "locked"; the remaining
		// percentage is split evenly across the untouched ones and updated
		// in place. Editing another only moves the still-untouched fields.
		// A saved percent split loads its people as already-locked, so the
		// first rebalance doesn't wipe it back to an even distribution.
		const touched = new Set<string>(
			this.initial?.split.mode === "percent"
				? Object.keys(this.initial.split.shares ?? {})
				: []
		);
		let percentInputs = new Map<string, HTMLInputElement>();
		const rebalancePercents = () => {
			const inc = this.includedList();
			const untouched = inc.filter((x) => !touched.has(x));
			const lockedSum = inc
				.filter((x) => touched.has(x))
				.reduce((s, x) => s + (this.percents[x] ?? 0), 0);
			let remaining = Math.round((100 - lockedSum) * 100) / 100;
			if (remaining < 0) remaining = 0;
			const n = untouched.length;
			if (n > 0) {
				const base = Math.floor((remaining / n) * 100) / 100;
				untouched.forEach((x, i) => {
					this.percents[x] =
						i === n - 1
							? Math.round((remaining - base * (n - 1)) * 100) /
							  100
							: base;
				});
			}
			// Reflect the recalculated (untouched) fields without disturbing
			// the one being edited
			untouched.forEach((x) => {
				const inp = percentInputs.get(x);
				if (inp) {
					inp.value = this.percents[x]
						? String(this.percents[x])
						: "";
				}
			});
		};

		// Owed amounts shown inline beside each name; updated in place so
		// typing doesn't lose focus
		let owedSpans = new Map<string, HTMLElement>();
		const refreshOwed = () => {
			const amount = Number(amountInput.value) || 0;
			const shares = this.buildShares();
			const cost: PlanCost = {
				label: labelInput.value,
				amount,
				split: { mode: this.mode, ...(shares && { shares }) },
			};
			const owed =
				amount > 0
					? PlanOperations.owedFor(cost, this.participants)
					: {};
			for (const [p, span] of owedSpans) {
				const v = owed[p] ?? 0;
				span.setText(v > 0 ? ` • $${v.toFixed(2)}` : "");
			}
		};

		const renderShares = () => {
			sharesWrap.empty();
			owedSpans = new Map();
			percentInputs = new Map();
			const isPercent = this.mode === "percent";
			const isShares = this.mode === "shares";

			const head = sharesWrap.createDiv({
				cls: "plan-cost-shares-head",
			});
			head.createDiv({
				cls: "section-helper-text",
				text: isPercent
					? "Tick who's splitting this. Percentages should add up to 100%."
					: isShares
					? "Tick who's in; weights divide the cost (e.g. nights, drinks)."
					: "Tick who's splitting this evenly.",
			});
			const allChecked = this.included.size === this.participants.length;
			const checkAllBtn = head.createEl("button", {
				cls: "callander-button plan-cost-checkall",
				text: allChecked ? "Uncheck all" : "Check all",
			});
			checkAllBtn.addEventListener("click", () => {
				if (allChecked) {
					this.included.clear();
					this.weights = {};
					this.percents = {};
					touched.clear();
				} else {
					this.participants.forEach((p) => this.included.add(p));
				}
				renderShares();
			});

			const totalEl = isPercent
				? sharesWrap.createDiv({ cls: "plan-cost-total" })
				: null;
			const refreshTotal = () => {
				if (!totalEl) return;
				const sum = this.participants.reduce(
					(s, p) => s + (this.percents[p] ?? 0),
					0
				);
				const rounded = Math.round(sum * 100) / 100;
				totalEl.setText(`Total: ${rounded}%`);
				totalEl.toggleClass(
					"is-balanced",
					Math.abs(rounded - 100) < 0.01
				);
				totalEl.toggleClass("is-off", Math.abs(rounded - 100) >= 0.01);
			};

			for (const p of this.participants) {
				const row = sharesWrap.createDiv({
					cls: "plan-cost-share-row",
				});
				const nameLabel = row.createEl("label", {
					cls: "plan-cost-share-name plan-cost-check",
				});
				const box = nameLabel.createEl("input", {
					attr: { type: "checkbox" },
				});
				box.checked = this.included.has(p);
				nameLabel.createSpan({ text: p });
				owedSpans.set(
					p,
					nameLabel.createSpan({ cls: "plan-cost-owed" })
				);

				const right = row.createDiv({
					cls: "plan-cost-share-right",
				});
				if (isShares || isPercent) {
					const active = this.included.has(p);
					const input = right.createEl("input", {
						cls: `contact-field-input plan-cost-share-input ${
							active ? "" : "is-disabled"
						}`,
						attr: {
							type: "number",
							min: "0",
							placeholder: isPercent ? "%" : "0",
						},
					});
					input.disabled = !active;
					const store = isPercent ? this.percents : this.weights;
					if (active && store[p]) input.value = String(store[p]);
					if (isPercent) {
						percentInputs.set(p, input);
						right.createSpan({
							cls: "plan-cost-share-suffix",
							text: "%",
						});
					}
					input.addEventListener("input", () => {
						const raw = input.value.trim();
						const v = Number(raw);
						if (isPercent) {
							if (raw === "") {
								// Cleared → unlock, let it auto-fill again
								touched.delete(p);
								delete this.percents[p];
							} else if (Number.isFinite(v) && v >= 0) {
								touched.add(p);
								this.percents[p] = v;
							}
							rebalancePercents();
						} else {
							if (Number.isFinite(v) && v > 0) store[p] = v;
							else delete store[p];
						}
						refreshTotal();
						refreshOwed();
					});
				}

				box.addEventListener("change", () => {
					if (box.checked) this.included.add(p);
					else {
						this.included.delete(p);
						delete this.weights[p];
						delete this.percents[p];
						touched.delete(p);
					}
					renderShares();
				});
			}

			if (isPercent) {
				// Fresh render fills untouched fields (even split if nothing
				// locked yet)
				rebalancePercents();

				const evenBtn = sharesWrap.createEl("button", {
					cls: "callander-button",
					text: "Distribute evenly",
				});
				evenBtn.addEventListener("click", () => {
					touched.clear();
					rebalancePercents();
					refreshTotal();
					refreshOwed();
				});
				refreshTotal();
			}
			refreshOwed();
		};

		amountInput.addEventListener("input", refreshOwed);
		renderShares();

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		if (this.initial && this.onDelete) {
			const del = buttons.createEl("button", {
				text: "Delete",
				cls: "callander-modal-button callander-modal-button-danger",
			});
			const handleDelete = async () => {
				await this.onDelete!();
				this.close();
			};
			del.addEventListener("click", () => void handleDelete());
		}
		const saveButton = buttons.createEl("button", {
			text: this.initial ? "Save" : "Add",
			cls: "callander-modal-button mod-cta",
		});
		const handleSave = async () => {
			const label = labelInput.value.trim();
			const amount = Number(amountInput.value);
			if (!label || !Number.isFinite(amount) || amount <= 0) return;
			const shares = this.buildShares();
			await this.onSubmit({
				label,
				amount,
				split: { mode: this.mode, ...(shares && { shares }) },
			});
			this.close();
		};
		saveButton.addEventListener("click", () => void handleSave());
	}

	onClose() {
		this.contentEl.empty();
	}
}
