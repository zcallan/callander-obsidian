import { App } from "obsidian";
import { AddCategoryModal } from "@/modals/AddCategoryModal";
import { ConfirmModal } from "@/modals/ConfirmModal";

/** Holding a chip this long removes the category everywhere, not just here. */
const LONG_PRESS_MS = 2000;

export interface CategoryChipsOptions {
	app: App;
	/** The field's own label — "Categories", "Category". */
	label: string;
	/**
	 * Render the label the way the surrounding modal does.
	 *
	 * The quick-idea modal uses form <label>s; the plan-item modal uses its
	 * own uppercase section headings. A field that brings the wrong one
	 * announces itself as imported from somewhere else.
	 */
	labelStyle?: "field" | "section";
	/** A line under the chips saying what to group by. */
	help?: string;
	/**
	 * The selected names, mutated in place.
	 *
	 * In place rather than through a callback because both callers hold this
	 * array as the value they're about to save; handing back a new one every
	 * toggle would leave them re-assigning a field on every keystroke's worth
	 * of clicking.
	 */
	selected: string[];
	/** Names this plan already knows, offered for reuse. */
	known: readonly string[];
	/** Removes a name from the plan's vocabulary and everything carrying it. */
	onDeleteCategory?: (category: string) => Promise<void>;
	/** What a long-press warns it is about to affect. */
	deleteScope: string;
}

/**
 * The category picker: every name the plan knows as a chip, tapped to pick.
 *
 * Shared between a plan's ideas and its stays, which ask the same question
 * of two different lists — one implementation so the two can't drift on what
 * a long-press does or how a new name is matched.
 *
 * Adding trails the real chips and looks like one: adding is the same kind
 * of act as picking, and a chip keeps it on the line rather than spending a
 * form row on it.
 */
export function renderCategoryChips(
	form: HTMLElement,
	options: CategoryChipsOptions
): void {
	const { app, selected, onDeleteCategory } = options;
	const field = form.createDiv({
		cls: "callander-modal-field quick-idea-cat-field",
	});
	if (options.labelStyle === "section") {
		field.createDiv({ cls: "modal-section-label", text: options.label });
	} else {
		field.createEl("label", { text: options.label });
	}

	// The plan's own names plus anything already picked here — an edit can
	// carry a category the plan has since stopped listing.
	const names = [...options.known];
	for (const cat of selected) {
		if (!names.some((c) => c.toLowerCase() === cat.toLowerCase())) {
			names.push(cat);
		}
	}

	const chipsEl = field.createDiv({ cls: "quick-idea-cat-chips" });
	if (options.help) {
		field.createDiv({
			cls: "section-helper-text quick-idea-cat-help",
			text: options.help,
		});
	}

	const isPicked = (cat: string) =>
		selected.some((c) => c.toLowerCase() === cat.toLowerCase());

	const confirmDeleteCategory = (cat: string) => {
		if (!onDeleteCategory) return;
		new ConfirmModal(
			app,
			"Remove category",
			`Remove "${cat}"? This takes it off every ${options.deleteScope} on this plan, not just this one.`,
			"Remove",
			async () => {
				await onDeleteCategory(cat);
				const at = names.findIndex(
					(c) => c.toLowerCase() === cat.toLowerCase()
				);
				if (at >= 0) names.splice(at, 1);
				const picked = selected.findIndex(
					(c) => c.toLowerCase() === cat.toLowerCase()
				);
				if (picked >= 0) selected.splice(picked, 1);
				renderChips();
			}
		).open();
	};

	const toggle = (cat: string) => {
		const at = selected.findIndex(
			(c) => c.toLowerCase() === cat.toLowerCase()
		);
		if (at >= 0) selected.splice(at, 1);
		else selected.push(cat);
		renderChips();
	};

	const add = (raw: string) => {
		const name = raw.trim();
		if (!name) return;
		// Case-insensitive: "boston" and "Boston" are one category, and
		// whichever spelling the plan already has wins.
		const existing = names.find(
			(c) => c.toLowerCase() === name.toLowerCase()
		);
		const value = existing ?? name;
		if (!existing) names.push(value);
		if (!isPicked(value)) selected.push(value);
		renderChips();
	};

	const renderChips = () => {
		chipsEl.empty();
		for (const cat of names) {
			const chip = chipsEl.createEl("button", {
				cls: "someday-filter-pill",
				text: cat,
				attr: { type: "button" },
			});
			chip.toggleClass("is-active", isPicked(cat));

			// Pointer events cover mouse and touch alike; the timer clears on
			// any early release so a normal tap still just toggles.
			let holdTimer: number | null = null;
			let longPressed = false;
			const clearHold = () => {
				if (holdTimer === null) return;
				window.clearTimeout(holdTimer);
				holdTimer = null;
			};
			chip.addEventListener("pointerdown", (e) => {
				if (e.button !== 0 || !onDeleteCategory) return;
				longPressed = false;
				holdTimer = window.setTimeout(() => {
					longPressed = true;
					confirmDeleteCategory(cat);
				}, LONG_PRESS_MS);
			});
			chip.addEventListener("pointerup", clearHold);
			chip.addEventListener("pointerleave", clearHold);
			chip.addEventListener("pointercancel", clearHold);
			// Long-press already opened the confirm dialog — the click that
			// follows a release shouldn't also toggle.
			chip.addEventListener("click", () => {
				if (longPressed) {
					longPressed = false;
					return;
				}
				toggle(cat);
			});
			chip.addEventListener("contextmenu", (e) => e.preventDefault());
		}

		const addChip = chipsEl.createEl("button", {
			cls: "someday-filter-pill quick-idea-cat-add",
			text: "+ Add",
			attr: { type: "button" },
		});
		addChip.addEventListener("click", () => {
			// Both the plan's list and anything picked here, so a name
			// already on screen can't be added a second time.
			new AddCategoryModal(app, (name) => add(name), names).open();
		});
	};

	renderChips();
}
