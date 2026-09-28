import { App, setIcon } from "obsidian";
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
	/**
	 * Offers an "Edit" toggle beside "+ Add". While it's on, tapping a chip
	 * opens `onEdit` for that category instead of picking it — for event
	 * categories, which carry a vault-wide name and a colour, and so have
	 * more to manage than a tap can express. Plan and stay categories don't
	 * pass this: renaming and colouring aren't questions they ask.
	 */
	editing?: {
		onEdit: (category: string) => void;
	};
	/**
	 * Offered only by event categories, which carry a colour — plan and
	 * stay categories don't, so they leave this out and get plain chips.
	 * Draws a dot before each chip's name, and offers the same colour
	 * picker (with a Reset, back to `defaultFor`) on the "+ Add" form.
	 */
	colorPicker?: {
		palette: readonly string[];
		/** The colour to paint a chip's dot with right now. */
		colorFor: (category: string) => string;
		/** What a brand-new category's swatch starts on, and Reset restores. */
		defaultFor: (category: string) => string;
		/** "" clears back to the default, same as everywhere else here. */
		onSetColor: (category: string, color: string) => void;
	};
}

/** What a caller can do to an already-rendered picker, from outside it. */
export interface CategoryChipsHandle {
	/**
	 * Re-derive the chip row from a fresh `known` list, keeping whatever's
	 * currently `selected` — for after a rename or delete elsewhere has
	 * changed the vocabulary out from under this picker.
	 */
	refresh(known: readonly string[]): void;
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
): CategoryChipsHandle {
	const { app, selected, onDeleteCategory } = options;
	// Persists across re-renders within this picker's own lifetime — a
	// rename or a colour change redraws the chips, and Edit shouldn't
	// switch itself off underneath whoever's using it.
	let editMode = false;
	const field = form.createDiv({
		cls: "callander-modal-field quick-idea-cat-field",
	});
	if (options.labelStyle === "section") {
		field.createDiv({ cls: "modal-section-label", text: options.label });
	} else {
		field.createEl("label", { text: options.label });
	}

	// The plan's own names plus anything already picked here — an edit can
	// carry a category the plan has since stopped listing. `let`, not
	// `const`: refresh() rebuilds this from a newer `known` list.
	let names: string[] = [];
	const rebuildNames = (known: readonly string[]) => {
		names = [...known];
		for (const cat of selected) {
			if (!names.some((c) => c.toLowerCase() === cat.toLowerCase())) {
				names.push(cat);
			}
		}
	};
	rebuildNames(options.known);

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

	// Created once, detached from the chip row until the first renderChips
	// puts it there — chipsEl gets emptied on every redraw, and recreating
	// this each time would forget whether Edit was on.
	const editToggle = field.createEl("button", {
		cls: "quick-idea-cat-edit-toggle",
		attr: {
			type: "button",
			"aria-label": "Edit categories",
			"data-tooltip-position": "top",
		},
	});
	setIcon(editToggle, "pencil");
	editToggle.toggleClass("is-hidden", !options.editing);

	const toggle = (cat: string) => {
		const at = selected.findIndex(
			(c) => c.toLowerCase() === cat.toLowerCase()
		);
		if (at >= 0) selected.splice(at, 1);
		else selected.push(cat);
		renderChips();
	};

	const add = (raw: string, color?: string) => {
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
		if (color !== undefined) options.colorPicker?.onSetColor(value, color);
		renderChips();
	};

	const renderChips = () => {
		chipsEl.empty();
		for (const cat of names) {
			const chip = chipsEl.createEl("button", {
				cls: "someday-filter-pill",
				attr: { type: "button" },
			});
			if (options.colorPicker) {
				const dot = chip.createSpan({ cls: "someday-filter-pill-dot" });
				dot.style.backgroundColor = options.colorPicker.colorFor(cat);
			}
			chip.createSpan({ text: cat });
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
				if (editMode && options.editing) {
					options.editing.onEdit(cat);
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
			const cp = options.colorPicker;
			// Both the plan's list and anything picked here, so a name
			// already on screen can't be added a second time.
			new AddCategoryModal(
				app,
				(name, color) => add(name, color),
				names,
				cp ? { palette: cp.palette, defaultColor: cp.defaultFor("") } : undefined
			).open();
		});

		// Moved rather than recreated — see where it's first made.
		chipsEl.appendChild(editToggle);
	};

	editToggle.addEventListener("click", () => {
		editMode = !editMode;
		editToggle.toggleClass("is-active", editMode);
	});

	renderChips();

	return {
		refresh(known) {
			rebuildNames(known);
			renderChips();
		},
	};
}
