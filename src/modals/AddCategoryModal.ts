import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import { closeColorPopover } from "@/components/colorPicker";
import { appendColorSwatchRow } from "@/components/colorSwatchRow";

/** Offered only by the callers whose categories carry a colour (events) —
 * plan and idea categories don't, so they leave this out and get the plain
 * name-only form. */
export interface AddCategoryColorOptions {
	palette: readonly string[];
	/** What the swatch row starts on, and what Reset restores it to. */
	defaultColor: string;
}

/**
 * One text field for naming a new quick-idea category — plus, for an event
 * category, a colour to go with it.
 *
 * Opened from the "+ Add" chip rather than living in the idea form itself:
 * the categories a plan uses settle early and then rarely change, so a
 * permanent text box sat there costing a row of the form to serve the rare
 * case. The chip is the same size as the categories it sits beside, which
 * also makes "add one" read as part of the same list rather than a separate
 * control above it.
 *
 * Stacks on top of the idea modal rather than replacing it — Obsidian
 * supports nested modals, and the idea underneath keeps its state, so
 * naming a category never costs a half-filled form.
 */
export class AddCategoryModal extends FormModal {
	constructor(
		app: App,
		/** `color` is "" when `colorOptions` wasn't offered, or nothing was
		 * hand-picked — treat that as "use the default", same as elsewhere. */
		private onSubmit: (name: string, color: string) => void,
		/** Existing names, matched case-insensitively to reject duplicates. */
		private existing: string[] = [],
		private colorOptions?: AddCategoryColorOptions
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Add category" });

		const form = contentEl.createEl("form", {
			cls: "callander-add-contact-form",
		});

		const field = form.createDiv({ cls: "callander-modal-field" });
		const input = field.createEl("input", {
			cls: "callander-modal-input",
			attr: {
				type: "text",
				// Only an event category carries colourOptions — the same
				// signal that decides whether the swatch row below shows up
				// also picks which examples fit here, rather than a plan or
				// idea category (a trip's places, e.g.) getting event ones.
				placeholder: this.colorOptions
					? "e.g. Celtics, Run Club, Movies"
					: "e.g. Boston",
				name: "category",
			},
		});

		// Named inline rather than as a validation message: the only way to
		// get here is typing a name, and a name that already exists isn't an
		// error worth a dialog — the chip is already on screen underneath.
		const note = field.createDiv({ cls: "section-helper-text" });
		note.hide();

		let swatches: { getColor(): string } | null = null;
		if (this.colorOptions) {
			const colorField = form.createDiv({ cls: "callander-modal-field" });
			colorField.createEl("label", { text: "Color" });
			swatches = appendColorSwatchRow(colorField, {
				palette: this.colorOptions.palette,
				initial: "",
				customFallback: this.colorOptions.defaultColor,
				resetTo: this.colorOptions.defaultColor,
				onChange: () => {},
			});
		}

		const buttons = form.createDiv({ cls: "callander-modal-buttons" });
		const cancel = buttons.createEl("button", {
			text: "Cancel",
			cls: "callander-modal-button",
			attr: { type: "button" },
		});
		cancel.addEventListener("click", () => this.close());

		const add = buttons.createEl("button", {
			text: "Add",
			cls: "callander-modal-button mod-cta",
			attr: { type: "submit" },
		});
		// Nothing to add until something is typed, so the primary action
		// starts unavailable rather than failing silently when pressed.
		add.disabled = true;

		const duplicate = (name: string) =>
			this.existing.some((c) => c.toLowerCase() === name.toLowerCase());

		input.addEventListener("input", () => {
			const name = input.value.trim();
			const clash = !!name && duplicate(name);
			add.disabled = !name || clash;
			note.setText(clash ? `"${name}" is already a category` : "");
			clash ? note.show() : note.hide();
		});

		form.addEventListener("submit", (e) => {
			e.preventDefault();
			const name = input.value.trim();
			if (!name || duplicate(name)) return;
			this.onSubmit(name, swatches?.getColor() ?? "");
			this.close();
		});

		input.focus();
	}

	onClose() {
		closeColorPopover();
		this.contentEl.empty();
	}
}
