import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type { PlanCredit } from "@/types";

/**
 * Record money a person has already handed over (a transfer, or covering
 * something else) so it comes off what they owe. Pick a person + amount, with
 * an optional note.
 */
export class PlanCreditModal extends FormModal {
	constructor(
		app: App,
		private participants: string[],
		private initial: PlanCredit | null,
		private onSubmit: (credit: PlanCredit) => Promise<void>,
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

		const personField = contentEl.createEl("div", {
			cls: "friend-tracker-modal-field",
		});
		personField.createEl("label", { text: "Who paid / transferred" });
		const personSelect = personField.createEl("select", {
			cls: "dropdown",
		});
		for (const p of this.participants) {
			const opt = personSelect.createEl("option", { value: p, text: p });
			if (this.initial?.person === p) opt.selected = true;
		}

		const amountField = contentEl.createEl("div", {
			cls: "friend-tracker-modal-field",
		});
		amountField.createEl("label", { text: "Amount ($)" });
		const amountInput = amountField.createEl("input", {
			cls: "friend-tracker-modal-input",
			attr: { type: "number", min: "0", placeholder: "0" },
		});
		if (this.initial) amountInput.value = String(this.initial.amount);

		const noteField = contentEl.createEl("div", {
			cls: "friend-tracker-modal-field",
		});
		noteField.createEl("label", { text: "Note (optional)" });
		const noteInput = noteField.createEl("input", {
			cls: "friend-tracker-modal-input",
			attr: { type: "text", placeholder: "e.g. Venmo, covered petrol" },
		});
		noteInput.value = this.initial?.note ?? "";

		const buttons = contentEl.createEl("div", {
			cls: "friend-tracker-modal-buttons",
		});
		if (this.initial && this.onDelete) {
			const del = buttons.createEl("button", {
				text: "Delete",
				cls: "friend-tracker-modal-button friend-tracker-modal-button-danger",
			});
			del.addEventListener("click", async () => {
				await this.onDelete!();
				this.close();
			});
		}
		const saveButton = buttons.createEl("button", {
			text: this.initial ? "Save" : "Add",
			cls: "friend-tracker-modal-button mod-cta",
		});

		const submit = async () => {
			const person = personSelect.value;
			const amount = Number(amountInput.value);
			if (!person || !Number.isFinite(amount) || amount <= 0) return;
			const note = noteInput.value.trim();
			await this.onSubmit({ person, amount, ...(note && { note }) });
			this.close();
		};
		saveButton.addEventListener("click", submit);
		for (const input of [amountInput, noteInput]) {
			input.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					submit();
				}
			});
		}
		setTimeout(() => amountInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
