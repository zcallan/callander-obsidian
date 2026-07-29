import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";

/** One text field — add a sub-idea to a Someday (a bakery on the Maine trip). */
export class SomedaySubIdeaModal extends FormModal {
	constructor(
		app: App,
		private somedayName: string,
		private onSubmit: (text: string) => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: `Add to ${this.somedayName}` });

		const input = contentEl.createEl("input", {
			cls: "callander-modal-input",
			attr: {
				type: "text",
				placeholder: "e.g. Beth's Bakery, sunset at the point…",
			},
		});

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		const saveButton = buttons.createEl("button", {
			text: "Add",
			cls: "callander-modal-button mod-cta",
		});
		const submit = async () => {
			const text = input.value.trim();
			if (!text) return;
			await this.onSubmit(text);
			this.close();
		};
		saveButton.addEventListener("click", submit);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				submit();
			}
		});
		window.setTimeout(() => input.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
