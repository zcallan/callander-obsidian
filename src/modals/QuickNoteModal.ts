import { App, Modal } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type { ContactWithCountdown } from "@/types";

/**
 * The fastest capture there is: one thought, optionally who it's about,
 * Enter. No category, no structure — triage happens later on the
 * dashboard, when there's time.
 */
export class QuickNoteModal extends FormModal {
	constructor(
		app: App,
		private contacts: ContactWithCountdown[],
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
		contentEl.createEl("h2", { text: "Quick note" });

		const textInput = contentEl.createEl("input", {
			cls: "quick-idea-input",
			attr: {
				type: "text",
				placeholder: "Jot it before it evaporates…",
			},
		});

		const friendField = contentEl.createEl("div", {
			cls: "friend-tracker-modal-field quick-note-friend-field",
		});
		friendField.createEl("label", { text: "Friend (optional)" });
		const friendInput = friendField.createEl("input", {
			cls: "friend-tracker-modal-input",
			attr: {
				type: "text",
				placeholder: "Leave blank to file later",
				list: "quick-note-friends",
			},
		});
		const datalist = friendField.createEl("datalist", {
			attr: { id: "quick-note-friends" },
		});
		this.contacts.forEach((c) => {
			datalist.createEl("option", { value: c.displayName });
		});

		const buttons = contentEl.createEl("div", {
			cls: "friend-tracker-modal-buttons",
		});
		const saveButton = buttons.createEl("button", {
			text: "Save draft",
			cls: "friend-tracker-modal-button mod-cta",
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

		saveButton.addEventListener("click", submit);
		for (const input of [textInput, friendInput]) {
			input.addEventListener("keydown", (event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					submit();
				}
			});
		}
		setTimeout(() => textInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
