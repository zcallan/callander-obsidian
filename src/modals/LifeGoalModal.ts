import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import type { LifeGoal } from "@/types";

/** Capture or edit something this person wants to do someday. */
export class LifeGoalModal extends FormModal {
	constructor(
		app: App,
		private name: string,
		private initial: LifeGoal | null,
		private onSubmit: (goal: LifeGoal) => Promise<void>,
		private onDelete?: () => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.initial ? "Edit life goal" : `Life goal — ${this.name}`,
		});

		contentEl.createDiv({ cls: "modal-section-label", text: "Goal" });
		const textInput = contentEl.createEl("input", {
			cls: "quick-idea-input",
			attr: {
				type: "text",
				placeholder: "e.g. Learn Spanish",
			},
		});
		textInput.value = this.initial?.text ?? "";

		contentEl.createDiv({
			cls: "modal-section-label",
			text: "Notes (optional)",
		});
		const notesInput = contentEl.createEl("textarea", {
			cls: "note-input-textarea",
			attr: {
				placeholder: "Where they're up to, what prompted it, how to help",
				rows: "3",
			},
		});
		notesInput.value = this.initial?.notes ?? "";

		const buttons = contentEl.createDiv({ cls: "callander-modal-buttons" });
		if (this.initial && this.onDelete) {
			const del = buttons.createEl("button", {
				text: "Delete",
				cls: "callander-modal-button callander-modal-button-danger",
				attr: { type: "button" },
			});
			del.addEventListener("click", () => {
				new ConfirmModal(
					this.app,
					"Delete life goal",
					`Delete "${this.initial!.text}"?`,
					"Delete",
					async () => {
						await this.onDelete!();
						this.close();
					}
				).open();
			});
		}

		const save = buttons.createEl("button", {
			text: this.initial ? "Save" : "Add",
			cls: "callander-modal-button mod-cta",
			attr: { type: "button" },
		});

		const submit = async () => {
			const text = textInput.value.trim();
			if (!text) return;
			const notes = notesInput.value.trim();
			await this.onSubmit({
				text,
				...(notes && { notes }),
				// Completion is carried through untouched — editing the
				// wording of a goal you've already done shouldn't reopen it.
				...(this.initial?.done && { done: true }),
				...(this.initial?.completed && {
					completed: this.initial.completed,
				}),
			});
			this.close();
		};
		save.addEventListener("click", () => void submit());
		textInput.addEventListener("keydown", (e) => {
			if (e.key !== "Enter") return;
			e.preventDefault();
			void submit();
		});
		notesInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				void submit();
			}
		});

		if (this.initial) this.blurInitialFocus();
		else window.setTimeout(() => textInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
