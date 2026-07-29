import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import type { Quote } from "@/types";

/** Capture or edit a memorable quote from a friend, with optional context. */
export class QuoteModal extends FormModal {
	constructor(
		app: App,
		private name: string,
		private initial: Quote | null,
		private onSubmit: (quote: Quote) => Promise<void>,
		private onDelete?: () => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.initial ? "Edit quote" : `Quote — ${this.name}`,
		});

		contentEl.createDiv({
			cls: "modal-section-label",
			text: "Quote",
		});
		const textInput = contentEl.createEl("textarea", {
			cls: "note-input-textarea",
			attr: { placeholder: "“…”", rows: "3" },
		});
		textInput.value = this.initial?.text ?? "";

		contentEl.createDiv({
			cls: "modal-section-label",
			text: "Context (optional)",
		});
		const contextInput = contentEl.createEl("input", {
			cls: "quick-idea-input",
			attr: { type: "text", placeholder: "e.g. at the beach · 2024" },
		});
		contextInput.value = this.initial?.context ?? "";

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
					"Delete quote",
					"Delete this quote?",
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
			const text = textInput.value.trim();
			if (!text) return;
			const context = contextInput.value.trim();
			await this.onSubmit({ text, ...(context && { context }) });
			this.close();
		};
		saveButton.addEventListener("click", submit);
		contextInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				submit();
			}
		});
		textInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				submit();
			}
		});
		window.setTimeout(() => textInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
