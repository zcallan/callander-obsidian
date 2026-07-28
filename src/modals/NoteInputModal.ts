import { App, Modal } from "obsidian";
import { FormModal } from "@/modals/FormModal";
/** One text field — a quick draft note about a known friend or plan. */
export class NoteInputModal extends FormModal {
	constructor(
		app: App,
		private targetName: string,
		private onSubmit: (text: string) => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: `Quick note — ${this.targetName}` });

		const input = contentEl.createEl("textarea", {
			cls: "note-input-textarea",
			attr: {
				placeholder: "Jot it before it evaporates…",
				rows: "4",
			},
		});

		const buttons = contentEl.createEl("div", {
			cls: "callander-modal-buttons",
		});
		const saveButton = buttons.createEl("button", {
			text: "Save draft",
			cls: "callander-modal-button mod-cta",
		});
		const submit = async () => {
			const text = input.value.trim();
			if (!text) return;
			await this.onSubmit(text);
			this.close();
		};
		saveButton.addEventListener("click", submit);
		// Cmd/Ctrl+Enter saves; plain Enter makes a newline
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				submit();
			}
		});
		setTimeout(() => input.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
