import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type { PlanCost } from "@/types";
import { PlanOperations } from "@/services/PlanOperations";
import { evaluateAmount } from "@/utils/calc";

/**
 * Add/edit a shared expense: a label, an amount, who's splitting it, and
 * how — evenly, by integer shares (nights, drinks…), or by explicit
 * percent. Each mode keeps its own values so switching never bleeds.
 */
export class PlanCostModal extends FormModal {
	private mode: "even" | "shares" | "percent" | "value" | "receipt";
	private included: Set<string>;
	private weights: Record<string, number> = {};
	private percents: Record<string, number> = {};
	/** Exact dollar amounts, per person — "value" and "receipt" modes. */
	private values: Record<string, number> = {};
	/**
	 * Receipt mode: how each line was typed, when it was arithmetic. Held
	 * separately from `values` so a re-render (ticking someone, switching
	 * a mode) redraws "7+7" rather than collapsing it to 14.
	 */
	private exprs: Record<string, string> = {};
	/** Receipt mode: sales tax / tip %, or null when not being applied. */
	private tax: number | null = null;
	private tip: number | null = null;

	constructor(
		app: App,
		private participants: string[],
		private initial: PlanCost | null,
		private onSubmit: (cost: PlanCost) => Promise<void>,
		private onDelete?: () => Promise<void>,
		defaultParticipant?: string,
		/** Pre-filled tax/tip % when those boxes are first ticked. */
		private taxDefault = 6.25,
		private tipDefault = 20
	) {
		super(app);
		this.mode = initial?.split.mode ?? "even";
		const sh = initial?.split.shares ?? {};
		if (initial?.split.mode === "shares") this.weights = { ...sh };
		if (initial?.split.mode === "percent") this.percents = { ...sh };
		if (initial?.split.mode === "value") this.values = { ...sh };
		if (initial?.split.mode === "receipt") {
			this.values = { ...sh };
			this.exprs = { ...(initial.split.exprs ?? {}) };
			this.tax = initial.split.tax ?? null;
			this.tip = initial.split.tip ?? null;
		}
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

	/** Sum of the per-person lines, before tax and tip. */
	private receiptSubtotal(): number {
		return this.includedList().reduce(
			(sum, p) => sum + (this.values[p] ?? 0),
			0
		);
	}

	/**
	 * Subtotal plus tax and tip. Both are charged on the subtotal rather
	 * than stacked, so 6.25% tax and 20% tip on $100 is $126.25 — not
	 * $127.50 from tipping on the taxed amount.
	 */
	private receiptTotal(): number {
		const sub = this.receiptSubtotal();
		return sub + (sub * ((this.tax ?? 0) + (this.tip ?? 0))) / 100;
	}

	private includedList(): string[] {
		return this.participants.filter((p) => this.included.has(p));
	}

	/** The typed-out calculations worth keeping, for the people still in. */
	private buildExprs(): Record<string, string> | undefined {
		if (this.mode !== "receipt") return undefined;
		const out: Record<string, string> = {};
		for (const p of this.includedList()) {
			if (this.exprs[p] && this.values[p]) out[p] = this.exprs[p];
		}
		return Object.keys(out).length ? out : undefined;
	}

	private buildShares(): Record<string, number> | undefined {
		const inc = this.includedList();
		if (inc.length === 0) return undefined;
		if (this.mode === "percent") {
			const s: Record<string, number> = {};
			for (const p of inc) if (this.percents[p]) s[p] = this.percents[p];
			return Object.keys(s).length ? s : undefined;
		}
		if (this.mode === "value" || this.mode === "receipt") {
			// Only what's actually been entered — a 0 is the same as
			// "nothing assigned to them yet".
			const s: Record<string, number> = {};
			for (const p of inc) if (this.values[p]) s[p] = this.values[p];
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
				["value", "By value"],
				["receipt", "By receipt"],
			] as Array<["even" | "shares" | "percent" | "value", string]>
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

		// Reassigned on each render; the amount field calls it too, since a
		// value split is measured against that amount.
		let refreshTotal: () => void = () => undefined;
		// Defined below renderShares (it needs the amount field), but called
		// from inside it — so it starts as a no-op for the first pass.
		let syncReceipt: () => void = () => undefined;
		// The "$3.20" beside each tax/tip row, with the percentage it's
		// derived from. Rebuilt whenever the rows are.
		let addOnAmounts: Array<{
			el: HTMLElement;
			percent: () => number | null;
		}> = [];

		const renderShares = () => {
			sharesWrap.empty();
			owedSpans = new Map();
			percentInputs = new Map();
			addOnAmounts = [];
			const isPercent = this.mode === "percent";
			const isShares = this.mode === "shares";
			const isValue = this.mode === "value";
			const isReceipt = this.mode === "receipt";
			// Receipt rows are dollar amounts too — only the total differs
			const isMoney = isValue || isReceipt;

			const head = sharesWrap.createDiv({
				cls: "plan-cost-shares-head",
			});
			head.createDiv({
				cls: "section-helper-text",
				text: isPercent
					? "Tick who's splitting this. Percentages should add up to 100%."
					: isShares
					? "Tick who's in; weights divide the cost (e.g. nights, drinks)."
					: isReceipt
					? "Tick who's in, then enter each person's own line off the receipt."
					: isValue
					? "Tick who's in, then set what each of them owes."
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
					this.values = {};
					this.exprs = {};
				} else {
					this.participants.forEach((p) => this.included.add(p));
				}
				renderShares();
			});

			const totalEl =
				isPercent || isValue
					? sharesWrap.createDiv({ cls: "plan-cost-total" })
					: null;
			refreshTotal = () => {
				if (!totalEl) return;

				if (isValue) {
					const amount = Number(amountInput.value) || 0;
					const sum = this.includedList().reduce(
						(s, p) => s + (this.values[p] ?? 0),
						0
					);
					const assigned = Math.round(sum * 100) / 100;
					const gap = Math.round((amount - assigned) * 100) / 100;
					const balanced = Math.abs(gap) < 0.01;
					// Nothing to measure against until there's a total
					const pending = amount <= 0;
					totalEl.setText(
						pending
							? `Assigned $${assigned.toFixed(2)}`
							: balanced
							? `Assigned $${assigned.toFixed(
									2
							  )} of $${amount.toFixed(2)}`
							: `Assigned $${assigned.toFixed(
									2
							  )} of $${amount.toFixed(2)} — $${Math.abs(
									gap
							  ).toFixed(2)} ${gap > 0 ? "short" : "over"}`
					);
					totalEl.toggleClass("is-balanced", !pending && balanced);
					totalEl.toggleClass("is-unbalanced", !pending && !balanced);
					totalEl.toggleClass("is-off", false);
					return;
				}

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
					cls: `plan-cost-share-row${
						isReceipt ? " plan-cost-expr-row" : ""
					}`,
				});
				const nameLabel = row.createEl("label", {
					cls: "plan-cost-share-name plan-cost-check",
				});
				const box = nameLabel.createEl("input", {
					attr: { type: "checkbox" },
				});
				box.checked = this.included.has(p);
				nameLabel.createSpan({ text: p });
				// Receipt rows show their running sum beside the input
				// instead, so the name stays clean.
				if (!isReceipt) {
					owedSpans.set(
						p,
						nameLabel.createSpan({ cls: "plan-cost-owed" })
					);
				}

				const right = row.createDiv({
					cls: "plan-cost-share-right",
				});
				if (isShares || isPercent || isMoney) {
					const active = this.included.has(p);
					// Sits where a tax/tip row shows its dollar figure —
					// ahead of the field's own "$", so it reads as its own
					// number rather than a second prefix.
					const preview = isReceipt
						? right.createSpan({ cls: "plan-cost-addon-amount" })
						: null;
					// Value mode reads as money, so the $ leads the field
					if (isMoney) {
						right.createSpan({
							cls: "plan-cost-share-prefix",
							text: "$",
						});
					}
					const input = right.createEl("input", {
						cls: `contact-field-input plan-cost-share-input ${
							isReceipt ? "plan-cost-expr-input" : ""
						} ${active ? "" : "is-disabled"}`,
						attr: isReceipt
							? {
									// Text, not number: a receipt line can be
									// written as "7+7". No inputmode either —
									// the numeric keypads have no "+".
									type: "text",
									placeholder: "0",
							  }
							: {
									type: "number",
									min: "0",
									placeholder: isPercent ? "%" : "0",
							  },
					});
					input.disabled = !active;
					// Nothing is pre-filled in value mode — ticking someone
					// leaves them at 0 until you say what they owe.
					const store = isPercent
						? this.percents
						: isMoney
						? this.values
						: this.weights;
					if (active) {
						// The expression as typed wins over its result, so
						// re-rendering the list never rewrites your working.
						const expr = isReceipt ? this.exprs[p] : undefined;
						if (expr) input.value = expr;
						else if (store[p]) input.value = String(store[p]);
					}
					if (isPercent) {
						percentInputs.set(p, input);
						right.createSpan({
							cls: "plan-cost-share-suffix",
							text: "%",
						});
					}

					// A receipt line can run to "5+5+5+5+5+5", so the field
					// grows with what's in it instead of clipping. Capped so
					// a runaway expression scrolls rather than shoving the
					// name off the row.
					const autosizeExpr = () => {
						const chars = Math.max(5, input.value.length + 2);
						input.style.width = `${Math.min(chars, 23)}ch`;
					};
					// What the expression comes to, live. Only for actual
					// arithmetic — echoing "$7.00" beside a plain 7 is noise.
					const syncPreview = () => {
						if (!preview) return;
						const raw = input.value.trim();
						if (!raw) {
							preview.setText("");
							preview.toggleClass("is-invalid", false);
							return;
						}
						const result = evaluateAmount(raw);
						if (result === null) {
							preview.setText("Invalid");
							preview.toggleClass("is-invalid", true);
							return;
						}
						preview.toggleClass("is-invalid", false);
						preview.setText(
							/[+\-*/()]/.test(raw)
								? `$${result.toFixed(2)}`
								: ""
						);
					};
					if (isReceipt) {
						autosizeExpr();
						syncPreview();
						input.addEventListener("input", () => {
							autosizeExpr();
							syncPreview();
						});
					}
					input.addEventListener("input", () => {
						const raw = input.value.trim();
						// "7+7" reads as 14; anything that doesn't parse
						// yet (like a trailing "+") simply doesn't count
						const v = isReceipt
							? evaluateAmount(raw) ?? NaN
							: Number(raw);
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
							// Shares and value both take the number as given
							if (Number.isFinite(v) && v > 0) store[p] = v;
							else delete store[p];
						}
						if (isReceipt) {
							// Only actual arithmetic is worth remembering —
							// "14" is its own explanation.
							if (/[+\-*/()]/.test(raw)) this.exprs[p] = raw;
							else delete this.exprs[p];
						}
						refreshTotal();
						syncReceipt();
						refreshOwed();
					});
				}

				box.addEventListener("change", () => {
					if (box.checked) this.included.add(p);
					else {
						this.included.delete(p);
						delete this.weights[p];
						delete this.percents[p];
						delete this.values[p];
						delete this.exprs[p];
						touched.delete(p);
					}
					renderShares();
				});
			}

			if (isReceipt) {
				// Tax and tip are charges on the bill rather than people, so
				// a rule separates them from the diners above.
				sharesWrap.createDiv({ cls: "plan-cost-addon-divider" });

				// Same row shape as a person, so they scan as part of the
				// same list — just a % rather than a $.
				const addOn = (
					label: string,
					get: () => number | null,
					set: (v: number | null) => void,
					fallback: number
				) => {
					const row = sharesWrap.createDiv({
						cls: "plan-cost-share-row",
					});
					const nameLabel = row.createEl("label", {
						cls: "plan-cost-share-name plan-cost-check",
					});
					const box = nameLabel.createEl("input", {
						attr: { type: "checkbox" },
					});
					box.checked = get() !== null;
					nameLabel.createSpan({ text: label });

					const right = row.createDiv({
						cls: "plan-cost-share-right",
					});
					// What this percentage actually comes to, so the bill
					// is readable without doing the sums yourself
					addOnAmounts.push({
						el: right.createSpan({
							cls: "plan-cost-addon-amount",
						}),
						percent: get,
					});
					const input = right.createEl("input", {
						cls: `contact-field-input plan-cost-share-input ${
							box.checked ? "" : "is-disabled"
						}`,
						attr: { type: "number", min: "0", placeholder: "%" },
					});
					input.disabled = !box.checked;
					if (get() !== null) input.value = String(get());
					right.createSpan({
						cls: "plan-cost-share-suffix",
						text: "%",
					});

					box.addEventListener("change", () => {
						// Ticking it starts from your configured default
						set(box.checked ? fallback : null);
						renderShares();
					});
					input.addEventListener("input", () => {
						const raw = input.value.trim();
						const v = Number(raw);
						set(
							raw !== "" && Number.isFinite(v) && v >= 0 ? v : 0
						);
						refreshTotal();
						syncReceipt();
						refreshOwed();
					});
				};

				addOn(
					"Add sales tax?",
					() => this.tax,
					(v) => {
						this.tax = v;
					},
					this.taxDefault
				);
				addOn(
					"Add tip?",
					() => this.tip,
					(v) => {
						this.tip = v;
					},
					this.tipDefault
				);
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
			if (isValue) refreshTotal();
			syncReceipt();
			refreshOwed();
		};

		// Receipt mode computes its own total from the lines, so the amount
		// field is along for the ride rather than an input.
		const receiptTotalEl = contentEl.createDiv({
			cls: "plan-cost-total plan-cost-receipt-total is-balanced",
		});
		syncReceipt = () => {
			const isReceipt = this.mode === "receipt";
			receiptTotalEl.toggleClass("is-hidden", !isReceipt);
			amountInput.disabled = isReceipt;
			amountInput.toggleClass("is-disabled", isReceipt);
			if (!isReceipt) return;
			// Tax/tip are charged on the subtotal, so that's what each
			// percentage is taken of — never the running total.
			const subtotal = this.receiptSubtotal();
			for (const { el, percent } of addOnAmounts) {
				const pct = percent();
				el.setText(
					pct === null
						? ""
						: `$${((subtotal * pct) / 100).toFixed(2)}`
				);
			}
			const total = this.receiptTotal();
			receiptTotalEl.setText(`Total: $${total.toFixed(2)}`);
			// Keep the saved amount honest with what's on screen
			amountInput.value = total > 0 ? total.toFixed(2) : "";
		};

		amountInput.addEventListener("input", () => {
			refreshTotal();
			refreshOwed();
		});
		renderShares();
		syncReceipt();

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
			const isReceipt = this.mode === "receipt";
			// A receipt's total is the sum of its lines, not a typed figure
			const amount = isReceipt
				? Math.round(this.receiptTotal() * 100) / 100
				: Number(amountInput.value);
			if (!label || !Number.isFinite(amount) || amount <= 0) return;
			const shares = this.buildShares();
			const exprs = this.buildExprs();
			await this.onSubmit({
				label,
				amount,
				split: {
					mode: this.mode,
					...(shares && { shares }),
					...(exprs && { exprs }),
					...(isReceipt && this.tax !== null && { tax: this.tax }),
					...(isReceipt && this.tip !== null && { tip: this.tip }),
				},
			});
			this.close();
		};
		saveButton.addEventListener("click", () => void handleSave());
	}

	onClose() {
		this.contentEl.empty();
	}
}
