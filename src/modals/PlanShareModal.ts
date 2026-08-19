import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import {
	PLAN_SHARE_DETAIL_DEFAULTS,
	PLAN_SHARE_GROUPS,
	PLAN_SHARE_ROW_FIELDS,
	type PlanShareDetail,
	type PlanShareGroup,
	type PlanShareRowDetail,
} from "@/utils/planShare";

/** A per-kind box, kept so the General masters can grey it out. */
interface RowBox {
	group: Exclude<PlanShareGroup, "general">;
	id: keyof PlanShareRowDetail;
	input: HTMLInputElement;
	row: HTMLElement;
}

/**
 * "Copy as text", with the level of detail exposed and the result editable
 * before it leaves.
 *
 * The textarea is both preview and final word: what gets copied is whatever
 * is in it when Copy is pressed, so a one-off tweak — dropping a line, fixing
 * a name — needs no round trip through the plan itself.
 *
 * Extends FormModal, so once a box is ticked or the text touched, a stray
 * click on the backdrop shakes the modal instead of discarding the edit.
 */
export class PlanShareModal extends FormModal {
	private detail: PlanShareDetail = structuredClone(
		PLAN_SHARE_DETAIL_DEFAULTS
	);
	private preview!: HTMLTextAreaElement;
	private rowBoxes: RowBox[] = [];

	constructor(
		app: App,
		/** Render the message at a given level of detail. */
		private build: (detail: PlanShareDetail) => string,
		private onCopy: (text: string) => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("plan-share-modal");
		contentEl.createEl("h2", { text: "Copy as text" });

		const groups = contentEl.createDiv({ cls: "plan-share-groups" });
		for (const group of PLAN_SHARE_GROUPS) {
			const wrap = groups.createDiv({ cls: "plan-share-group" });
			wrap.createDiv({
				cls: "plan-share-group-label",
				text: group.label,
			});
			const options = wrap.createDiv({
				cls: "plan-share-group-options",
			});

			// Overview and Emojis lead General on a line of their own — they're
			// properties of the whole message with no per-kind equivalent.
			// Breaking after them leaves the four shared toggles starting at
			// the same x as the identical boxes in the groups below.
			if (group.id === "general") {
				this.addToggle(options, "Overview", () => this.detail.overview, (v) => {
					this.detail.overview = v;
				});
				this.addToggle(options, "Emojis", () => this.detail.emojis, (v) => {
					this.detail.emojis = v;
				});
				this.addToggle(
					options,
					"Empty dates",
					() => this.detail.emptyDates,
					(v) => {
						this.detail.emptyDates = v;
					}
				);
				options.createDiv({ cls: "plan-share-break" });
			}

			for (const field of PLAN_SHARE_ROW_FIELDS) {
				const box = this.addToggle(
					options,
					field.label,
					() => this.detail[group.id][field.id],
					(v) => {
						this.detail[group.id][field.id] = v;
					}
				);
				if (group.id !== "general") {
					this.rowBoxes.push({
						group: group.id,
						id: field.id,
						input: box.input,
						row: box.row,
					});
				}
			}

		}
		this.syncMasters();

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

	private addToggle(
		parent: HTMLElement,
		label: string,
		get: () => boolean,
		set: (value: boolean) => void
	): { input: HTMLInputElement; row: HTMLElement } {
		const row = parent.createEl("label", { cls: "plan-share-option" });
		const input = row.createEl("input", { attr: { type: "checkbox" } });
		input.checked = get();
		row.createSpan({ text: label });
		input.addEventListener("change", () => {
			set(input.checked);
			this.syncMasters();
			this.refresh();
		});
		return { input, row };
	}

	/**
	 * Grey out the per-kind boxes their General master has switched off.
	 *
	 * Disabled rather than unticked on purpose: the box keeps whatever it was
	 * set to, so turning the master back on restores exactly that instead of
	 * making the user redo it. The output ignores them meanwhile — see
	 * effectiveRowDetail, which both this and the text generation read.
	 */
	private syncMasters() {
		for (const box of this.rowBoxes) {
			const enabled = this.detail.general[box.id];
			box.input.disabled = !enabled;
			box.row.toggleClass("is-disabled", !enabled);
		}
	}

	/**
	 * Regenerate the preview from the current toggles, discarding hand edits.
	 *
	 * Toggling a box is a fresh answer to "what should this message say", so
	 * it has to win. Merging the two isn't possible in any honest way — there
	 * is no way to tell which of the user's edits were meant to survive a
	 * regeneration and which were patching around the setting they just
	 * changed.
	 */
	private refresh() {
		this.preview.value = this.build(this.detail);
	}

	onClose() {
		this.contentEl.empty();
	}
}
