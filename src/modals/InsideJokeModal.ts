import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import type { InsideJoke } from "@/types";

/** Capture or edit an inside joke, with optional context (how it started). */
export class InsideJokeModal extends FormModal {
	constructor(
		app: App,
		private name: string,
		private initial: InsideJoke | null,
		private onSubmit: (joke: InsideJoke) => Promise<void>,
		private onDelete?: () => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.initial
				? "Edit inside joke"
				: `Inside joke — ${this.name}`,
		});

		contentEl.createDiv({
			cls: "modal-section-label",
			text: "Inside joke",
		});
		const textInput = contentEl.createEl("textarea", {
			cls: "note-input-textarea",
			attr: { placeholder: "e.g. “the seagull incident”", rows: "3" },
		});
		textInput.value = this.initial?.text ?? "";

		contentEl.createDiv({
			cls: "modal-section-label",
			text: "Context (optional)",
		});
		const contextInput = contentEl.createEl("input", {
			cls: "quick-idea-input",
			attr: { type: "text", placeholder: "e.g. how it started · 2024" },
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
					"Delete inside joke",
					"Delete this inside joke?",
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
		saveButton.addEventListener("click", () => void submit());
		contextInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				void submit();
			}
		});
		textInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				void submit();
			}
		});
		window.setTimeout(() => textInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
