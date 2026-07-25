import { App, Modal } from "obsidian";
import type { ContactWithCountdown } from "@/types";

/**
 * Add someone to a plan: a friend (autocompleted) or anyone else (guest),
 * optionally as unconfirmed.
 */
export class AddPlanMemberModal extends Modal {
	constructor(
		app: App,
		private contacts: ContactWithCountdown[],
		private onSubmit: (
			entry: { contact: ContactWithCountdown | null; name: string },
			unconfirmed: boolean
		) => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Who's coming?" });

		const nameField = contentEl.createEl("div", {
			cls: "friend-tracker-modal-field",
		});
		nameField.createEl("label", { text: "Name" });
		const nameInput = nameField.createEl("input", {
			cls: "friend-tracker-modal-input",
			attr: {
				type: "text",
				placeholder: "A friend, or anyone (guest)",
				list: "plan-member-suggestions",
			},
		});
		const datalist = nameField.createEl("datalist", {
			attr: { id: "plan-member-suggestions" },
		});
		this.contacts.forEach((c) =>
			datalist.createEl("option", { value: c.displayName })
		);

		const checkRow = contentEl.createEl("label", {
			cls: "plan-unconfirmed-check",
		});
		const checkbox = checkRow.createEl("input", {
			attr: { type: "checkbox" },
		});
		checkRow.createSpan({ text: "Unconfirmed (not sure they're in yet)" });

		const buttons = contentEl.createEl("div", {
			cls: "friend-tracker-modal-buttons",
		});
		const addButton = buttons.createEl("button", {
			text: "Add",
			cls: "friend-tracker-modal-button mod-cta",
		});

		const submit = async () => {
			const name = nameInput.value.trim();
			if (!name) return;
			const contact =
				this.contacts.find(
					(c) =>
						c.displayName.toLowerCase() === name.toLowerCase() ||
						c.name.toLowerCase() === name.toLowerCase()
				) ?? null;
			await this.onSubmit({ contact, name }, checkbox.checked);
			this.close();
		};
		addButton.addEventListener("click", submit);
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
