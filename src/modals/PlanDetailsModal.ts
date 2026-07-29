import { App } from "obsidian";
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
		private onSubmit: (details: PlanDetails) => Promise<void>,
		private onDelete?: () => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Plan details" });

		const details = { ...this.current };

		const dateField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		dateField.createEl("label", { text: "When" });
		createFlexDateInput(
			dateField,
			details.date,
			(v) => {
				details.date = v;
			},
			{
				inputClass: "callander-modal-input",
				defaultPrecision: "month",
			}
		);

		const endField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		endField.createEl("label", { text: "Until (optional)" });
		createFlexDateInput(
			endField,
			details.endDate,
			(v) => {
				details.endDate = v;
			},
			{
				inputClass: "callander-modal-input",
				defaultPrecision: "day",
			}
		);

		const locationField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		locationField.createEl("label", { text: "Location" });
		const locationInput = locationField.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "text", placeholder: "e.g. Portland, Maine" },
		});
		locationInput.value = details.location;
		locationInput.addEventListener("input", () => {
			details.location = locationInput.value;
		});

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		if (this.onDelete) {
			const deleteButton = buttons.createEl("button", {
				text: "Delete plan",
				cls: "callander-modal-button callander-modal-button-danger",
			});
			deleteButton.addEventListener("click", () => {
				this.close();
				this.onDelete!();
			});
		}
		const saveButton = buttons.createEl("button", {
			text: "Save",
			cls: "callander-modal-button mod-cta",
		});
		const handleSave = async () => {
			await this.onSubmit({
				...details,
				location: details.location.trim(),
			});
			this.close();
		};
		saveButton.addEventListener("click", () => void handleSave());
	}

	onClose() {
		this.contentEl.empty();
	}
}
