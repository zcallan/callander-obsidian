import { App, Modal, setIcon } from "obsidian";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { formatDate } from "@/utils/dateFormat";
import type { LifeGoal } from "@/types";

/**
 * Read view for a life goal: what it is, how it's going, and the ways it
 * can turn into something.
 *
 * The two "turn this into" buttons are the point of the section. A goal is
 * only useful if it prompts something — an idea to help them along, or an
 * event once it's happening — so those routes sit here rather than being
 * reached by remembering to go elsewhere and retype it.
 *
 * Notes autosave as you type, the same as the plan timeline's read view:
 * this is the field you open the goal to update, and a Save button between
 * a thought and the file is a step nobody wants.
 */
export class LifeGoalViewModal extends Modal {
	private notesSaveTimer: number | null = null;
	private notesDirty = false;
	private pendingNotes: string;

	constructor(
		app: App,
		private goal: LifeGoal,
		private onEdit: () => void,
		private onDelete: () => Promise<void>,
		private onSaveNotes: (notes: string) => Promise<void>,
		private onToggleDone: (done: boolean) => Promise<void>,
		private onCreateIdea: () => void,
		private onCreateEvent: () => void
	) {
		super(app);
		this.pendingNotes = goal.notes ?? "";
	}

	private scheduleNotesSave(value: string) {
		this.pendingNotes = value;
		this.notesDirty = true;
		if (this.notesSaveTimer !== null) {
			window.clearTimeout(this.notesSaveTimer);
		}
		this.notesSaveTimer = window.setTimeout(
			() => void this.flushNotes(),
			600
		);
	}

	/** Write whatever's pending now — on blur, before any action, and on
	 * close, so a quick note-then-dismiss never loses keystrokes. */
	private async flushNotes() {
		if (this.notesSaveTimer !== null) {
			window.clearTimeout(this.notesSaveTimer);
			this.notesSaveTimer = null;
		}
		if (!this.notesDirty) return;
		this.notesDirty = false;
		await this.onSaveNotes(this.pendingNotes);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("someday-view-modal");

		contentEl.createDiv({ cls: "view-kind", text: "Life goal" });
		contentEl.createEl("h2", { text: this.goal.text });

		if (this.goal.done) {
			const when = this.goal.completed
				? new Date(`${this.goal.completed}T00:00:00`)
				: null;
			const label =
				when && !isNaN(when.getTime())
					? `✅ Done — ${formatDate(when, {
							day: "numeric",
							month: "long",
							year: "numeric",
					  })}`
					: "✅ Done";
			contentEl.createDiv({ cls: "someday-view-meta", text: label });
		}

		const notesInput = contentEl.createEl("textarea", {
			cls: "someday-view-notes-input",
			attr: {
				placeholder: "How's it going? What would help?",
				rows: "3",
			},
		});
		notesInput.value = this.pendingNotes;
		notesInput.addEventListener("input", () =>
			this.scheduleNotesSave(notesInput.value)
		);
		notesInput.addEventListener("blur", () => void this.flushNotes());
		// Being the only textarea it would otherwise take the modal's default
		// focus, popping a keyboard on mobile over the buttons below.
		window.setTimeout(() => notesInput.blur(), 0);

		contentEl.createDiv({ cls: "someday-view-divider" });

		const actions = contentEl.createDiv({ cls: "someday-view-actions" });
		const action = (
			icon: string,
			label: string,
			onClick: () => void | Promise<void>,
			cls = "callander-button"
		) => {
			const button = actions.createEl("button", { cls });
			setIcon(button, icon);
			button.createSpan({ text: label });
			button.addEventListener("click", () => {
				void (async () => {
					await this.flushNotes();
					await onClick();
				})();
			});
			return button;
		};

		// The two routes onward. Deliberately unprefilled: a goal is a
		// standing wish, and what you'd actually do about it this week is
		// rarely its own wording.
		action("lightbulb", "Add idea", () => {
			this.close();
			this.onCreateIdea();
		});
		action("milestone", "Add event", () => {
			this.close();
			this.onCreateEvent();
		});

		action(
			this.goal.done ? "rotate-ccw" : "check",
			this.goal.done ? "Reopen" : "Mark done",
			async () => {
				await this.onToggleDone(!this.goal.done);
				this.close();
			}
		);

		action("pencil", "Edit", () => {
			this.close();
			this.onEdit();
		});

		actions.createDiv({ cls: "diary-toolbar-spacer" });

		const del = actions.createEl("button", {
			cls: "callander-button button-icon button-danger",
			attr: { "aria-label": "Delete" },
		});
		setIcon(del, "trash-2");
		del.addEventListener("click", () => {
			new ConfirmModal(
				this.app,
				"Delete life goal",
				`Delete "${this.goal.text}"?`,
				"Delete",
				async () => {
					await this.onDelete();
					this.close();
				}
			).open();
		});
	}

	onClose() {
		void this.flushNotes();
		this.contentEl.empty();
	}
}
