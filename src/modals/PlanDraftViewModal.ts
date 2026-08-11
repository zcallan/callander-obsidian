import { App, Modal, setIcon } from "obsidian";
import { ConfirmModal } from "@/modals/ConfirmModal";
import {
	appendScheduleFields,
	type ScheduleFieldOptions,
} from "@/modals/scheduleFields";

/**
 * A dated draft, opened from the plan timeline.
 *
 * Its own view rather than the shared timeline one: a draft has none of
 * what that view is built around — no category, no location, no booking —
 * and everything it does have is editable here. The text saves itself as
 * you type, the way the other read views handle their notes.
 *
 * The two "Make…" buttons are the point of it. A draft is a thought you
 * haven't decided about yet; this is where you decide, and the draft is
 * consumed in the process rather than left behind as a duplicate.
 */
export class PlanDraftViewModal extends Modal {
	private saveTimer: number | null = null;
	private dirty = false;
	private pending: string;

	constructor(
		app: App,
		private text: string,
		private date: string | undefined,
		private dayOptions: ScheduleFieldOptions["dayOptions"],
		private onSaveText: (text: string) => Promise<void>,
		private onSaveDate: (date: string | undefined) => Promise<void>,
		/** Given the text as it stands now — an edit may not have been
		 * written yet, and the draft is about to be replaced by it. */
		private onMakeIdea: (text: string) => Promise<void>,
		private onMakeTravel: (text: string) => Promise<void>,
		private onDelete: () => Promise<void>
	) {
		super(app);
		this.pending = text;
	}

	/** Debounced write: keeps typing from hitting disk on every keystroke. */
	private scheduleSave(value: string) {
		this.pending = value;
		this.dirty = true;
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => void this.flush(), 600);
	}

	/** Write whatever's pending — on blur, before an action, and on close,
	 * so a quick edit-then-dismiss never loses the last few keystrokes. */
	private async flush() {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		if (!this.dirty) return;
		this.dirty = false;
		await this.onSaveText(this.pending.trim());
	}

	/**
	 * Turning a draft into something else destroys it, so it asks first —
	 * and the answer decides both halves at once: the draft goes and the
	 * real form opens already carrying what the draft knew.
	 */
	private confirmMake(
		kind: "idea" | "travel",
		run: (text: string) => Promise<void>
	) {
		const preview =
			this.pending.trim().length > 60
				? this.pending.trim().slice(0, 60) + "…"
				: this.pending.trim();
		new ConfirmModal(
			this.app,
			`Make ${kind}`,
			`Turn "${preview}" into ${
				kind === "idea" ? "an idea" : "a travel leg"
			}? The draft will be replaced.`,
			`Make ${kind}`,
			async () => {
				// Don't flush: the draft is about to go, and writing to it
				// first would only be undone a moment later.
				this.dirty = false;
				this.close();
				await run(this.pending.trim());
			}
		).open();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("someday-view-modal");

		contentEl.createDiv({ cls: "view-kind", text: "Draft" });

		const input = contentEl.createEl("textarea", {
			cls: "someday-view-notes-input",
			attr: { placeholder: "Jot it before it evaporates…", rows: "4" },
		});
		input.value = this.pending;
		input.addEventListener("input", () => this.scheduleSave(input.value));
		input.addEventListener("blur", () => void this.flush());
		// It'd otherwise take the modal's default focus and pop the keyboard
		// on mobile before you've decided what you came here to do.
		window.setTimeout(() => input.blur(), 0);

		// The day it sits on. Clearing it takes the draft off the timeline
		// without discarding it.
		if (this.dayOptions?.length) {
			const schedule = appendScheduleFields(
				contentEl,
				{ date: this.date },
				{
					dayOptions: this.dayOptions,
					hideTime: true,
					hidePeople: true,
					dateLabel: "Date (optional)",
					onDateChange: () => {
						void this.onSaveDate(schedule.values().date);
					},
				}
			);
		}

		contentEl.createDiv({ cls: "someday-view-divider" });

		const actions = contentEl.createDiv({ cls: "someday-view-actions" });

		const idea = actions.createEl("button", { cls: "callander-button" });
		setIcon(idea, "lightbulb");
		idea.createSpan({ text: "Make idea" });
		idea.addEventListener("click", () =>
			this.confirmMake("idea", (text) => this.onMakeIdea(text))
		);

		const travel = actions.createEl("button", { cls: "callander-button" });
		setIcon(travel, "plane");
		travel.createSpan({ text: "Make travel" });
		travel.addEventListener("click", () =>
			this.confirmMake("travel", (text) => this.onMakeTravel(text))
		);

		const del = actions.createEl("button", {
			cls: "callander-button button-icon button-danger",
			attr: { "aria-label": "Discard draft" },
		});
		setIcon(del, "trash");
		del.addEventListener("click", () => {
			const preview =
				this.pending.trim().length > 60
					? this.pending.trim().slice(0, 60) + "…"
					: this.pending.trim();
			new ConfirmModal(
				this.app,
				"Discard draft",
				`Discard "${preview}"?`,
				"Discard",
				async () => {
					this.dirty = false; // nothing left to save to
					this.close();
					await this.onDelete();
				}
			).open();
		});
	}

	onClose() {
		void this.flush();
		this.contentEl.empty();
	}
}
