import { App, Modal } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type FriendTracker from "@/main";
import { createFlexDateInput } from "@/components/FlexDateInput";

/** Create a plan: a name and a date as rough as you actually know. */
export class PlanModal extends FormModal {
	constructor(
		app: App,
		private plugin: FriendTracker,
		private onCreated: (file: import("obsidian").TFile) => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "New plan" });

		const nameField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		nameField.createEl("label", { text: "What's the plan?" });
		const nameInput = nameField.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "text", placeholder: "e.g. Weekend in Maine" },
		});

		let dateValue = "";
		const dateField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		dateField.createEl("label", { text: "When (as rough as you like)" });
		createFlexDateInput(
			dateField,
			"",
			(v) => {
				dateValue = v;
			},
			{
				inputClass: "callander-modal-input",
				defaultPrecision: "month",
			}
		);

		let endDateValue = "";
		const endDateField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		endDateField.createEl("label", { text: "Until (optional)" });
		createFlexDateInput(
			endDateField,
			"",
			(v) => {
				endDateValue = v;
			},
			{
				inputClass: "callander-modal-input",
				defaultPrecision: "day",
			}
		);

		const locationField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		locationField.createEl("label", { text: "Where (optional)" });
		const locationInput = locationField.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "text", placeholder: "e.g. Providence, RI" },
		});

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		const createButton = buttons.createEl("button", {
			text: "Create plan",
			cls: "callander-modal-button mod-cta",
		});

		const submit = async () => {
			const name = nameInput.value.trim();
			if (!name) return;
			const file = await this.plugin.planOperations.createPlan(
				name,
				dateValue,
				locationInput.value,
				endDateValue
			);
			this.close();
			this.onCreated(file);
		};
		createButton.addEventListener("click", submit);
		nameInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				submit();
			}
		});
		window.setTimeout(() => nameInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
