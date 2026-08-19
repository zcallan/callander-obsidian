import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type { ContactWithCountdown, Expense } from "@/types";
import { owedFor, payersOf, percentFromInput } from "@/utils/expenseMath";
import { evaluateAmount } from "@/utils/calc";
import {
	appendContactPicker,
	type ContactPickerHandle,
} from "@/components/ContactPicker";
import { resolvePeopleNames } from "@/utils/people";

/**
 * Where the people splitting this come from. Supplied only for a standalone
 * expense, which carries its own list and so shows a People field; without
 * it the participants are fixed by whoever passed them in.
 */
export interface ExpensePeopleSource {
	contacts: ContactWithCountdown[];
	/** For resolving picked wikilinks — the note the expense lives on. */
	sourcePath: string;
}

/**
 * Starting values for a brand-new expense, when whatever opened the form
 * already knows some of the answer — a plan idea with a cost and a guest
 * list, say.
 *
 * Deliberately separate from `initial`: that means "an expense that already
 * exists", and drives the title, the Save/Add wording and whether Delete is
 * offered. A prefilled Add is still an Add.
 */
export interface ExpensePrefill {
	label?: string;
	amount?: number;
	/** Ticked to begin with, by display name. Names the participant list
	 * doesn't have are dropped rather than silently ignored downstream. */
	included?: string[];
}

/**
 * Add/edit a shared expense: a label, an amount, who's splitting it, and
 * how — evenly, by integer shares (nights, drinks…), or by explicit
 * percent. Each mode keeps its own values so switching never bleeds.
 */
export class ExpenseModal extends FormModal {
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
	/** The People field's handle — only set for a standalone expense. */
	private peopleHandle?: ContactPickerHandle;

	constructor(
		app: App,
		private participants: string[],
		private initial: Expense | null,
		private onSubmit: (cost: Expense) => Promise<void>,
		private onDelete?: () => Promise<void>,
		private defaultParticipant?: string,
		/** Pre-filled tax/tip % when those boxes are first ticked. */
		private taxDefault = 6.25,
		private tipDefault = 20,
		/** Set to show a People field and take participants from it. */
		private peopleSource?: ExpensePeopleSource,
		/** Starting values for a new expense — see ExpensePrefill. */
		private prefill?: ExpensePrefill
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
		// A prefilled list is only as good as the names in it — anyone the
		// plan doesn't have can't be ticked, so drop them here rather than
		// letting a phantom participant reach the split.
		const suggested = this.participants.filter((p) =>
			(prefill?.included ?? []).some(
				(n) => n.toLowerCase() === p.toLowerCase()
			)
		);

		/**
		 * Who an existing expense already charges.
		 *
		 * Derived with `payersOf` — the same function the read view and "Who
		 * owes what" use — rather than read literally off `split.shares`, so
		 * the ticks can never disagree with the arithmetic.
		 *
		 * That distinction is the whole bug this replaced. `buildShares()`
		 * deliberately omits `shares` for an even split when everyone's in,
		 * so new plan members auto-join; taking that absence at face value
		 * ticked nobody but you, and pressing Save then wrote
		 * `shares: { you: 1 }` — silently turning a split among everyone into
		 * a split among one person, and changing what everybody owed.
		 */
		const charged = initial ? payersOf(initial, this.participants) : [];

		// Included: whoever the split already charges, then anyone suggested,
		// else just you by default.
		if (charged.length > 0) {
			this.included = new Set(charged);
		} else if (suggested.length > 0) {
			this.included = new Set(suggested);
		} else {
			const you =
				defaultParticipant &&
				this.participants.includes(defaultParticipant)
					? defaultParticipant
					: this.participants[0];
			this.included = new Set(you ? [you] : []);
		}
	}

	/**
	 * True when the People field decides who's splitting this. Naming
	 * someone there is already the decision, so the per-person ticks below
	 * follow it rather than offering a second, contradictable answer.
	 */
	private get peopleAreFixed(): boolean {
		return !!this.peopleSource;
	}

	/**
	 * Rebuild the participant list from the People field. You're always on
	 * it — you're the one doing the splitting — the same way your name sits
	 * alongside the members anywhere else people are listed.
	 */
	private syncParticipants() {
		if (!this.peopleHandle || !this.peopleSource) return;
		const picked = resolvePeopleNames(
			this.app,
			this.peopleSource.sourcePath,
			this.peopleHandle.wikilinks()
		);
		const you = this.defaultParticipant?.trim();
		this.participants =
			you && !picked.some((p) => p.toLowerCase() === you.toLowerCase())
				? [you, ...picked]
				: picked;
		// Everyone named is in, by definition — no separate ticking.
		this.included = new Set(this.participants);
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
		labelInput.value = this.initial?.label ?? this.prefill?.label ?? "";

		const amountField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		amountField.createEl("label", { text: "Total amount ($)" });
		const amountInput = amountField.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "number", min: "0", placeholder: "0" },
		});
		if (this.initial) amountInput.value = String(this.initial.amount);
		else if (this.prefill?.amount !== undefined) {
			amountInput.value = String(this.prefill.amount);
		}

		// Who's in on it. Only for a standalone expense — when the people are
		// already fixed by whatever this belongs to, there's nothing to pick.
		if (this.peopleSource) {
			const peopleField = contentEl.createDiv({
				cls: "callander-modal-field",
			});
			peopleField.createEl("label", { text: "People" });
			this.peopleHandle = appendContactPicker(
				peopleField,
				this.app,
				this.peopleSource.contacts,
				this.initial?.people ?? [],
				this.peopleSource.sourcePath,
				{
					allowGuests: true,
					// The split rows below are built from the participant
					// list, so they have to be rebuilt whenever it changes.
					onChange: () => {
						this.syncParticipants();
						renderShares();
					},
				}
			);
			this.syncParticipants();
		}

		const modeRow = contentEl.createDiv({
			cls: "quick-idea-categories",
		});
		const modeButtons = new Map<string, HTMLButtonElement>();
		const sharesWrap = contentEl.createDiv({
			cls: "expense-shares",
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
			const cost: Expense = {
				label: labelInput.value,
				amount,
				split: { mode: this.mode, ...(shares && { shares }) },
			};
			const owed =
				amount > 0
					? owedFor(cost, this.participants)
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
				cls: "expense-shares-head",
			});
			// Second wording drops the "tick who's in" instruction: with the
			// People field deciding that, the only thing left to say is what
			// the numbers beside each name mean.
			const HELPERS = {
				percent: [
					"Tick who's splitting this. Percentages should add up to 100%.",
					"Percentages should add up to 100%.",
				],
				shares: [
					"Tick who's in; weights divide the cost (e.g. nights, drinks).",
					"Weights divide the cost (e.g. nights, drinks).",
				],
				receipt: [
					"Tick who's in, then enter each person's own line off the receipt.",
					"Enter each person's own line off the receipt.",
				],
				value: [
					"Tick who's in, then set what each of them owes.",
					"Set what each of them owes.",
				],
				even: [
					"Tick who's splitting this evenly.",
					"Split evenly between everyone above.",
				],
			} as const;
			head.createDiv({
				cls: "section-helper-text",
				text: HELPERS[this.mode][this.peopleAreFixed ? 1 : 0],
			});
			// Nothing to check or uncheck when the People field already
			// settles who's in — the button would only ever be a no-op.
			if (!this.peopleAreFixed) {
				const allChecked =
					this.included.size === this.participants.length;
				const checkAllBtn = head.createEl("button", {
					cls: "callander-button expense-checkall",
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
						this.participants.forEach((p) =>
							this.included.add(p)
						);
					}
					renderShares();
				});
			}

			const totalEl =
				isPercent || isValue
					? sharesWrap.createDiv({ cls: "expense-total" })
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
					cls: `expense-share-row${
						isReceipt ? " expense-expr-row" : ""
					}`,
				});
				const nameLabel = row.createEl("label", {
					cls: `expense-share-name expense-check${
						this.peopleAreFixed ? " is-fixed" : ""
					}`,
				});
				const box = nameLabel.createEl("input", {
					attr: { type: "checkbox" },
				});
				box.checked = this.included.has(p);
				// Kept for consistency with the plan version, but there's
				// nothing to decide here: removing someone means taking
				// them out of the People field above.
				box.disabled = this.peopleAreFixed;
				nameLabel.createSpan({ text: p });
				// Receipt rows show their running sum beside the input
				// instead, so the name stays clean.
				if (!isReceipt) {
					owedSpans.set(
						p,
						nameLabel.createSpan({ cls: "expense-owed" })
					);
				}

				const right = row.createDiv({
					cls: "expense-share-right",
				});
				if (isShares || isPercent || isMoney) {
					const active = this.included.has(p);
					// Sits where a tax/tip row shows its dollar figure —
					// ahead of the field's own "$", so it reads as its own
					// number rather than a second prefix.
					const preview = isReceipt
						? right.createSpan({ cls: "expense-addon-amount" })
						: null;
					// Value mode reads as money, so the $ leads the field
					if (isMoney) {
						right.createSpan({
							cls: "expense-share-prefix",
							text: "$",
						});
					}
					const input = right.createEl("input", {
						cls: `contact-field-input expense-share-input ${
							isReceipt ? "expense-expr-input" : ""
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
							cls: "expense-share-suffix",
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
							// An empty field is an answer — 0% — and stays
							// locked like any other. Treating it as "unlock
							// me" instead made the field impossible to clear:
							// unlocking put it back in the auto-fill pool, and
							// the rebalance immediately wrote a figure back
							// into the box you were trying to empty.
							//
							// "Distribute evenly" is the way back to auto-fill.
							touched.add(p);
							const pct = percentFromInput(raw);
							if (pct !== null) this.percents[p] = pct;
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
				sharesWrap.createDiv({ cls: "expense-addon-divider" });

				// Same row shape as a person, so they scan as part of the
				// same list — just a % rather than a $.
				const addOn = (
					label: string,
					get: () => number | null,
					set: (v: number | null) => void,
					fallback: number
				) => {
					const row = sharesWrap.createDiv({
						cls: "expense-share-row",
					});
					const nameLabel = row.createEl("label", {
						cls: "expense-share-name expense-check",
					});
					const box = nameLabel.createEl("input", {
						attr: { type: "checkbox" },
					});
					box.checked = get() !== null;
					nameLabel.createSpan({ text: label });

					const right = row.createDiv({
						cls: "expense-share-right",
					});
					// What this percentage actually comes to, so the bill
					// is readable without doing the sums yourself
					addOnAmounts.push({
						el: right.createSpan({
							cls: "expense-addon-amount",
						}),
						percent: get,
					});
					const input = right.createEl("input", {
						cls: `contact-field-input expense-share-input ${
							box.checked ? "" : "is-disabled"
						}`,
						attr: { type: "number", min: "0", placeholder: "%" },
					});
					input.disabled = !box.checked;
					if (get() !== null) input.value = String(get());
					right.createSpan({
						cls: "expense-share-suffix",
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
			cls: "expense-total expense-receipt-total is-balanced",
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
			const people = this.peopleHandle?.wikilinks();
			await this.onSubmit({
				label,
				amount,
				...(people && { people }),
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

		// Fields that arrive already filled shouldn't grab focus — the same
		// reason an edit doesn't. Otherwise opening this pops the keyboard on
		// mobile over a field there's no reason to retype.
		if (this.initial || this.prefill) this.blurInitialFocus();
	}

	onClose() {
		this.contentEl.empty();
	}
}
