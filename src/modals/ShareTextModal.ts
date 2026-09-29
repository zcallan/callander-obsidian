import { App, Notice } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import {
	buildExpenseShareText,
	shareDefaultsFor,
	shareFieldsFor,
	type ExpenseShareInput,
	type ExpenseShareScope,
} from "@/utils/expenseShare";

/** One toggle in a share sheet. */
export interface ShareField<D> {
	id: keyof D & string;
	label: string;
}

/**
 * "Copy as text": toggles above, an editable preview below, and what leaves
 * is whatever is in the textarea when Copy is pressed. A one-off tweak —
 * dropping a line, fixing a name — needs no round trip through the note.
 *
 * Generic over the detail it drives, because the plan's costs, its stays and
 * anything after them ask the same question with different words in it. The
 * caller supplies the fields, the starting state and the builder; this owns
 * only the shape.
 *
 * Flat toggles, unlike the timeline's PlanShareModal and its master/child
 * pairs — nothing here has per-kind rows for a master to govern. That modal
 * keeps its own class; this one borrows its `plan-share-*` styles, which are
 * about the shape of a share sheet rather than about plans.
 *
 * Extends FormModal, so once a box is ticked or the text touched, a stray
 * backdrop click shakes the modal instead of discarding the edit.
 */
// The mapped constraint, rather than Record<string, boolean>: an interface
// without an index signature isn't assignable to that, and every detail
// type here is a plain interface.
export class ShareTextModal<
	D extends { [K in keyof D]: boolean },
> extends FormModal {
	private preview!: HTMLTextAreaElement;

	constructor(
		app: App,
		private fields: ShareField<D>[],
		private detail: D,
		private build: (detail: D) => string,
		private onCopy: (text: string) => Promise<void>,
		private options: {
			/**
			 * Half-height preview, for content that runs to a few lines. A
			 * full box would be mostly empty, and on a phone it pushes Copy
			 * off the screen.
			 */
			short?: boolean;
		} = {}
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
		// Only what the caller offers — a toggle with nothing to act on
		// looks broken when pressing it changes nothing.
		for (const field of this.fields) {
			const row = options.createEl("label", {
				cls: "plan-share-option",
			});
			const input = row.createEl("input", {
				attr: { type: "checkbox" },
			});
			input.checked = this.detail[field.id];
			row.createSpan({ text: field.label });
			input.addEventListener("change", () => {
				this.detail[field.id] = input.checked as D[keyof D & string];
				this.refresh();
			});
		}

		this.preview = contentEl.createEl("textarea", {
			cls: `plan-share-preview${
				this.options.short ? " plan-share-preview-short" : ""
			}`,
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
}

/** Put a share sheet's text on the clipboard, and say so. */
export async function copyShareText(text: string): Promise<void> {
	await navigator.clipboard.writeText(text);
	new Notice("📋 Copied — ready to paste as text");
}

/**
 * Costs as text, at whatever scope the caller opened it from — one
 * expense, one person, or the lot; a plan's or the dashboard's own.
 *
 * `read` runs again each time a toggle flips, so the preview follows an
 * edit made in another pane rather than a snapshot taken when the sheet
 * opened.
 */
export function openExpenseShare(
	app: App,
	scope: ExpenseShareScope,
	read: () => Omit<ExpenseShareInput, "scope">
): void {
	new ShareTextModal(
		app,
		shareFieldsFor(scope),
		shareDefaultsFor(scope),
		(detail) => buildExpenseShareText({ scope, ...read() }, detail),
		copyShareText,
		// One expense is a handful of lines.
		{ short: scope.kind === "expense" }
	).open();
}
