import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import {
	EXPENSE_SHARE_DEFAULTS,
	shareFieldsFor,
	type ExpenseShareDetail,
	type ExpenseShareScope,
} from "@/utils/expenseShare";

/**
 * "Copy as text" for a plan's costs — one expense, one person, or the lot.
 *
 * Same shape as the timeline's PlanShareModal: toggles above, an editable
 * preview below, and what leaves is whatever is in the textarea when Copy
 * is pressed. A one-off tweak — dropping a line, fixing a name — needs no
 * round trip through the plan.
 *
 * Flat toggles rather than that modal's master/child pairs: costs have no
 * per-kind rows to master, so a single row of boxes is the whole control.
 * It borrows the `plan-share-*` styles, which are about the shape of a
 * share sheet rather than about plans.
 *
 * Extends FormModal, so once a box is ticked or the text touched, a stray
 * backdrop click shakes the modal instead of discarding the edit.
 */
export class ExpenseShareModal extends FormModal {
	private detail: ExpenseShareDetail = structuredClone(
		EXPENSE_SHARE_DEFAULTS
	);
	private preview!: HTMLTextAreaElement;

	constructor(
		app: App,
		private shareScope: ExpenseShareScope,
		private build: (detail: ExpenseShareDetail) => string,
		private onCopy: (text: string) => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("plan-share-modal");
		contentEl.createEl("h2", { text: "Copy as text" });

		const options = contentEl.createDiv({
			cls: "plan-share-group-options",
		});
		// Only the toggles that do anything here — a single expense has no
		// credits to list, and a single person's own name is the "people".
		for (const field of shareFieldsFor(this.shareScope)) {
			const row = options.createEl("label", {
				cls: "plan-share-option",
			});
			const input = row.createEl("input", {
				attr: { type: "checkbox" },
			});
			input.checked = this.detail[field.id];
			row.createSpan({ text: field.label });
			input.addEventListener("change", () => {
				this.detail[field.id] = input.checked;
				this.refresh();
			});
		}

		this.preview = contentEl.createEl("textarea", {
			cls: "plan-share-preview",
			attr: { spellcheck: "false" },
		});
		this.refresh();

		contentEl.createDiv({ cls: "plan-share-divider" });

		const buttons = contentEl.createDiv({ cls: "callander-modal-buttons" });
		const cancel = buttons.createEl("button", {
			text: "Cancel",
			cls: "callander-modal-button",
		});
		cancel.addEventListener("click", () => this.close());

		const copy = buttons.createEl("button", {
			text: "Copy",
			cls: "callander-modal-button mod-cta",
		});
		const handleCopy = async () => {
			// The textarea, not a rebuild: hand edits are the point.
			await this.onCopy(this.preview.value);
			this.close();
		};
		copy.addEventListener("click", () => void handleCopy());

		// Opens pre-filled, so don't land focus in it — on mobile that pops
		// the keyboard over text there's no reason to retype.
		this.blurInitialFocus();
	}

	/**
	 * Regenerate from the toggles, discarding hand edits.
	 *
	 * Toggling a box is a fresh answer to what the message should say, so it
	 * wins. There's no honest way to merge the two — nothing distinguishes an
	 * edit meant to survive from one patching around the setting just changed.
	 */
	private refresh() {
		this.preview.value = this.build(this.detail);
	}

	onClose() {
		this.contentEl.empty();
	}
}
