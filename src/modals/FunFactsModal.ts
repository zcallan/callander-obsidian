import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";

/** Add a single fun fact about a friend — one line worth remembering. */
export class FunFactsModal extends FormModal {
	constructor(
		app: App,
		private name: string,
		private onSubmit: (fact: string) => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: `Fun fact — ${this.name}` });

		const input = contentEl.createEl("input", {
			cls: "callander-modal-input",
			attr: {
				type: "text",
				placeholder: "e.g. Allergic to peanuts",
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
			const fact = input.value.trim();
			if (!fact) return;
			await this.onSubmit(fact);
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
