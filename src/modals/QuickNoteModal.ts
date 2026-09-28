import { App } from "obsidian";
import { guardedAction } from "@/components/guardedAction";
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

		// Two lines, not one: a note jotted in a hurry is usually a whole
		// sentence, and a single-line box scrolls its own start out of
		// sight while you're still writing it.
		const textInput = contentEl.createEl("textarea", {
			cls: "quick-idea-input quick-note-text",
			attr: {
				rows: "2",
				placeholder: "Jot it before it evaporates…",
			},
		});

		const friendField = contentEl.createDiv({
			cls: "callander-modal-field quick-note-friend-field",
		});
		friendField.createEl("label", { text: "Friend (optional)" });
		const friendInput = friendField.createEl("input", {
			cls: "callander-modal-input",
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

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		const saveButton = buttons.createEl("button", {
			text: "Save draft",
			cls: "callander-modal-button mod-cta",
		});

		const submit = guardedAction(
			async () => {
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
			},
			{ buttons: [saveButton] }
		);

		saveButton.addEventListener("click", () => void submit());
		// Enter still saves, the way it did when this was one line — it's
		// Shift+Enter that takes the second one.
		textInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && !event.shiftKey) {
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
		window.setTimeout(() => textInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
