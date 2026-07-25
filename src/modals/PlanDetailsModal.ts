import { App, Modal } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import { createFlexDateInput } from "@/components/FlexDateInput";

interface PlanDetails {
	date: string;
	endDate: string;
	location: string;
}

/** Edit a plan's date (or range) and location. */
export class PlanDetailsModal extends FormModal {
	constructor(
		app: App,
		private current: PlanDetails,
		private onSubmit: (details: PlanDetails) => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Plan details" });

		const details = { ...this.current };

		const dateField = contentEl.createEl("div", {
			cls: "friend-tracker-modal-field",
		});
		dateField.createEl("label", { text: "When" });
		createFlexDateInput(
			dateField,
			details.date,
			(v) => {
				details.date = v;
			},
			{
				inputClass: "friend-tracker-modal-input",
				defaultPrecision: "month",
			}
		);

		const endField = contentEl.createEl("div", {
			cls: "friend-tracker-modal-field",
		});
		endField.createEl("label", { text: "Until (optional)" });
		createFlexDateInput(
			endField,
			details.endDate,
			(v) => {
				details.endDate = v;
			},
			{
				inputClass: "friend-tracker-modal-input",
				defaultPrecision: "day",
			}
		);

		const locationField = contentEl.createEl("div", {
			cls: "friend-tracker-modal-field",
		});
		locationField.createEl("label", { text: "Location" });
		const locationInput = locationField.createEl("input", {
			cls: "friend-tracker-modal-input",
			attr: { type: "text", placeholder: "e.g. Portland, Maine" },
		});
		locationInput.value = details.location;
		locationInput.addEventListener("input", () => {
			details.location = locationInput.value;
		});

		const buttons = contentEl.createEl("div", {
			cls: "friend-tracker-modal-buttons",
		});
		const saveButton = buttons.createEl("button", {
			text: "Save",
			cls: "friend-tracker-modal-button mod-cta",
		});
		saveButton.addEventListener("click", async () => {
			await this.onSubmit({
				...details,
				location: details.location.trim(),
			});
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
