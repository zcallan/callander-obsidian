import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";

/** Edit a friend's "fun facts" — a line or two worth remembering. */
export class FunFactsModal extends FormModal {
	constructor(
		app: App,
		private name: string,
		private initial: string,
		private onSubmit: (text: string) => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: `Fun facts — ${this.name}` });

		const input = contentEl.createEl("textarea", {
			cls: "note-input-textarea",
			attr: {
				placeholder:
					"e.g. Allergic to peanuts · does triathlons · makes a mean lasagne",
				rows: "4",
			},
		});
		input.value = this.initial;

		const buttons = contentEl.createEl("div", {
			cls: "friend-tracker-modal-buttons",
		});
		const saveButton = buttons.createEl("button", {
			text: "Save",
			cls: "friend-tracker-modal-button mod-cta",
		});
		const submit = async () => {
			await this.onSubmit(input.value.trim());
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
