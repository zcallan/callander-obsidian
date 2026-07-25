import { App, Modal } from "obsidian";
import type FriendTracker from "@/main";
import { createFlexDateInput } from "@/components/FlexDateInput";

/** Create a plan: a name and a date as rough as you actually know. */
export class PlanModal extends Modal {
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

		const nameField = contentEl.createEl("div", {
			cls: "friend-tracker-modal-field",
		});
		nameField.createEl("label", { text: "What's the plan?" });
		const nameInput = nameField.createEl("input", {
			cls: "friend-tracker-modal-input",
			attr: { type: "text", placeholder: "e.g. Weekend in Maine" },
		});

		let dateValue = "";
		const dateField = contentEl.createEl("div", {
			cls: "friend-tracker-modal-field",
		});
		dateField.createEl("label", { text: "When (as rough as you like)" });
		createFlexDateInput(
			dateField,
			"",
			(v) => {
				dateValue = v;
			},
			{
				inputClass: "friend-tracker-modal-input",
				defaultPrecision: "month",
			}
		);

		const buttons = contentEl.createEl("div", {
			cls: "friend-tracker-modal-buttons",
		});
		const createButton = buttons.createEl("button", {
			text: "Create plan",
			cls: "friend-tracker-modal-button mod-cta",
		});

		const submit = async () => {
			const name = nameInput.value.trim();
			if (!name) return;
			const file = await this.plugin.planOperations.createPlan(
				name,
				dateValue
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
		setTimeout(() => nameInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
