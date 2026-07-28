import { App, Modal } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import { createFlexDateInput } from "@/components/FlexDateInput";

/**
 * Set (or clear) when an idea should resurface on the dashboard —
 * "show me this in November, before her birthday".
 */
export class ResurfaceModal extends FormModal {
	constructor(
		app: App,
		private ideaText: string,
		private currentValue: string | undefined,
		private onSubmit: (resurface: string) => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Resurface this idea" });
		contentEl.createEl("p", {
			cls: "section-helper-text",
			text: `"${this.ideaText}" — from when should the dashboard remind you?`,
		});

		let value = this.currentValue ?? "";
		const field = contentEl.createEl("div", {
			cls: "callander-modal-field",
		});
		createFlexDateInput(
			field,
			value,
			(v) => {
				value = v;
			},
			{
				inputClass: "callander-modal-input",
				defaultPrecision: "month",
			}
		);

		const buttons = contentEl.createEl("div", {
			cls: "callander-modal-buttons",
		});
		const clearButton = buttons.createEl("button", {
			text: "Clear",
			cls: "callander-modal-button",
		});
		clearButton.addEventListener("click", async () => {
			await this.onSubmit("");
			this.close();
		});
		const saveButton = buttons.createEl("button", {
			text: "Save",
			cls: "callander-modal-button mod-cta",
		});
		saveButton.addEventListener("click", async () => {
			await this.onSubmit(value);
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
