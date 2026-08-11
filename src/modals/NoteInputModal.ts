import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import {
	appendScheduleFields,
	type ScheduleFieldOptions,
} from "@/modals/scheduleFields";
/**
 * One text field — a quick draft note about a known friend or plan.
 *
 * Pass `initial` to edit an existing draft instead of capturing a new one;
 * the wording changes to match, since "Save draft" on something already
 * saved reads like it would make a second one.
 */
export class NoteInputModal extends FormModal {
	constructor(
		app: App,
		private targetName: string,
		private onSubmit: (text: string, date?: string) => Promise<void>,
		private initial?: string,
		/**
		 * Days to offer, when the note belongs to something with dates —
		 * a plan. Absent everywhere else, where a note has no day to sit on.
		 */
		private dayOptions?: ScheduleFieldOptions["dayOptions"],
		private initialDate?: string
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		const editing = this.initial !== undefined;
		contentEl.createEl("h2", {
			text: editing ? "Edit note" : `Quick note — ${this.targetName}`,
		});

		const input = contentEl.createEl("textarea", {
			cls: "note-input-textarea",
			attr: {
				placeholder: "Jot it before it evaporates…",
				rows: "4",
			},
		});
		input.value = this.initial ?? "";

		// Giving a note a day puts it on the plan's timeline; without one it
		// stays a draft waiting to be triaged.
		const schedule = this.dayOptions?.length
			? appendScheduleFields(
					contentEl,
					{ date: this.initialDate },
					{
						dayOptions: this.dayOptions,
						hideTime: true,
						hidePeople: true,
						dateLabel: "Date (optional)",
					}
			  )
			: null;

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		const saveButton = buttons.createEl("button", {
			text: editing ? "Save" : "Save draft",
			cls: "callander-modal-button mod-cta",
		});
		const submit = async () => {
			const text = input.value.trim();
			if (!text) return;
			await this.onSubmit(text, schedule?.values().date);
			this.close();
		};
		saveButton.addEventListener("click", () => void submit());
		// Cmd/Ctrl+Enter saves; plain Enter makes a newline
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				void submit();
			}
		});
		if (this.initial) this.blurInitialFocus();
		else window.setTimeout(() => input.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
