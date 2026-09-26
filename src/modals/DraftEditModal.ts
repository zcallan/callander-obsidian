import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type { ContactWithCountdown } from "@/types";

/**
 * Editing a draft from the dashboard: its text, and who (if anyone) it's
 * about. A plain inline textarea — what this replaces — has nowhere to put
 * a second field, and reassigning the person is exactly the kind of
 * afterthought a draft invites ("actually, this was about Sally").
 */
export class DraftEditModal extends FormModal {
	constructor(
		app: App,
		private contacts: ContactWithCountdown[],
		private initialText: string,
		/** Null: about nobody. */
		private initialContact: ContactWithCountdown | null,
		private onSubmit: (
			text: string,
			contact: ContactWithCountdown | null
		) => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Edit draft" });

		const textInput = contentEl.createEl("textarea", {
			cls: "quick-idea-input quick-note-text",
			attr: { rows: "2" },
		});
		textInput.value = this.initialText;

		const friendField = contentEl.createDiv({
			cls: "callander-modal-field quick-note-friend-field",
		});
		friendField.createEl("label", { text: "Friend (optional)" });
		const friendInput = friendField.createEl("input", {
			cls: "callander-modal-input",
			attr: {
				type: "text",
				placeholder: "Leave blank to file later",
				list: "draft-edit-friends",
			},
		});
		friendInput.value = this.initialContact?.displayName ?? "";
		const datalist = friendField.createEl("datalist", {
			attr: { id: "draft-edit-friends" },
		});
		this.contacts.forEach((c) => {
			datalist.createEl("option", { value: c.displayName });
		});

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		const saveButton = buttons.createEl("button", {
			text: "Save",
			cls: "callander-modal-button mod-cta",
		});

		const submit = async () => {
			const text = textInput.value.trim();
			if (!text) return;
			const query = friendInput.value.trim().toLowerCase();
			const contact = query
				? this.contacts.find(
						(c) =>
							c.displayName.toLowerCase() === query ||
							c.name.toLowerCase() === query
				  ) ?? null
				: null;
			await this.onSubmit(text, contact);
			this.close();
		};

		saveButton.addEventListener("click", () => void submit());
		textInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				void submit();
			}
		});
		friendInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void submit();
			}
		});
		this.blurInitialFocus();
	}

	onClose() {
		this.contentEl.empty();
	}
}
