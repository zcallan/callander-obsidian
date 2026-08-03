import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import { createFlexDateInput } from "@/components/FlexDateInput";

interface PlanDetails {
	name: string;
	date: string;
	endDate: string;
	location: string;
}

/** Edit a plan's name, date (or range) and location. */
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

		const nameField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		nameField.createEl("label", { text: "Name" });
		const nameInput = nameField.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "text", placeholder: "e.g. Byron Bay trip" },
		});
		nameInput.value = details.name;
		nameInput.addEventListener("input", () => {
			details.name = nameInput.value;
		});

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
				// A year alone is too vague to plan around
				precisions: ["month", "day"],
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
				precisions: ["month", "day"],
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
				// A cleared name isn't a rename — keep the current one
				name: details.name.trim() || this.current.name,
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
