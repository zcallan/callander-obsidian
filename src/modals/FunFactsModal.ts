import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import { ConfirmModal } from "@/modals/ConfirmModal";

/**
 * Capture or edit a single fun fact about a friend — one line worth
 * remembering. Editing an existing one offers Delete here, so the list
 * itself stays clean of always-visible controls.
 */
export class FunFactsModal extends FormModal {
	constructor(
		app: App,
		private name: string,
		private onSubmit: (fact: string) => Promise<void>,
		private initial: string | null = null,
		private onDelete?: () => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.initial ? "Edit fun fact" : `Fun fact — ${this.name}`,
		});

		const input = contentEl.createEl("input", {
			cls: "callander-modal-input",
			attr: {
				type: "text",
				placeholder: "e.g. Allergic to peanuts",
			},
		});
		input.value = this.initial ?? "";

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});

		if (this.initial && this.onDelete) {
			const del = buttons.createEl("button", {
				text: "Delete",
				cls: "callander-modal-button callander-modal-button-danger",
			});
			del.addEventListener("click", () => {
				new ConfirmModal(
					this.app,
					"Delete fun fact",
					"Delete this fun fact?",
					"Delete",
					async () => {
						await this.onDelete!();
						this.close();
					}
				).open();
			});
		}

		const saveButton = buttons.createEl("button", {
			text: this.initial ? "Save" : "Add",
			cls: "callander-modal-button mod-cta",
		});
		const submit = async () => {
			const fact = input.value.trim();
			if (!fact) return;
			await this.onSubmit(fact);
			this.close();
		};
		saveButton.addEventListener("click", () => void submit());
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				void submit();
			}
		});
		window.setTimeout(() => input.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
