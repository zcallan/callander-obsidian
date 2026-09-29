import { App } from "obsidian";
import { guardedAction } from "@/components/guardedAction";
import { FormModal } from "@/modals/FormModal";
import type { Credit } from "@/types";
import { confirmThenClose } from "@/modals/ConfirmModal";

/**
 * Record money a person has already handed over (a transfer, or covering
 * something else) so it comes off what they owe. Pick a person + amount, with
 * an optional note.
 */
export class CreditModal extends FormModal {
	constructor(
		app: App,
		private participants: string[],
		private initial: Credit | null,
		private onSubmit: (credit: Credit) => Promise<void>,
		private onDelete?: () => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.initial ? "Edit credit" : "Add credit",
		});

		const personField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		personField.createEl("label", { text: "Who paid / transferred" });
		const personSelect = personField.createEl("select", {
			cls: "dropdown",
		});
		for (const p of this.participants) {
			const opt = personSelect.createEl("option", { value: p, text: p });
			if (this.initial?.person === p) opt.selected = true;
		}

		const amountField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		amountField.createEl("label", { text: "Amount ($)" });
		const amountInput = amountField.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "number", min: "0", placeholder: "0" },
		});
		if (this.initial) amountInput.value = String(this.initial.amount);

		const noteField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		noteField.createEl("label", { text: "Note (optional)" });
		const noteInput = noteField.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "text", placeholder: "e.g. Venmo, covered petrol" },
		});
		noteInput.value = this.initial?.note ?? "";

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		const { initial, onDelete } = this;
		if (initial && onDelete) {
			const del = buttons.createEl("button", {
				text: "Delete",
				cls: "callander-modal-button callander-modal-button-danger",
			});
			// Asked first, like every other delete: a credit is frontmatter,
			// so nothing of it lands in the trash.
			del.addEventListener("click", () =>
				confirmThenClose(this, {
					title: "Delete credit",
					message: `Delete ${initial.person}'s credit?`,
					failure: "Couldn't delete",
					onConfirm: onDelete,
				})
			);
		}
		const saveButton = buttons.createEl("button", {
			text: this.initial ? "Save" : "Add",
			cls: "callander-modal-button mod-cta",
		});

		const submit = guardedAction(
			async () => {
				const person = personSelect.value;
				const amount = Number(amountInput.value);
				if (!person || !Number.isFinite(amount) || amount <= 0) return;
				const note = noteInput.value.trim();
				await this.onSubmit({ person, amount, ...(note && { note }) });
				this.close();
			},
			{ buttons: [saveButton] }
		);
		saveButton.addEventListener("click", () => void submit());
		this.submitOnEnter([amountInput, noteInput], submit);
		this.setInitialFocus(amountInput, !!this.initial);
	}
}
