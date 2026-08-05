import { App, Modal } from "obsidian";

/**
 * The pre-flight question for promoting a Someday into something firmer —
 * a plan, a reminder. Yes hands off to the pre-filled creation modal (via
 * `onYes`); nothing at all is written here. The checkbox — ticked by
 * default — asks that the someday be marked done once the promotion
 * actually saves, so cancelling the follow-up modal leaves it untouched.
 */
export class ConvertSomedayModal extends Modal {
	constructor(
		app: App,
		private title: string,
		private somedayName: string,
		private onYes: (markDone: boolean) => void | Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: this.title });
		contentEl.createEl("p", {
			cls: "convert-someday-name",
			text: `"${this.somedayName}"`,
		});

		const checkRow = contentEl.createEl("label", {
			cls: "convert-someday-check",
		});
		const box = checkRow.createEl("input", {
			attr: { type: "checkbox" },
		});
		box.checked = true;
		checkRow.createSpan({ text: "Mark this someday as done" });

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		const noBtn = buttons.createEl("button", {
			text: "No",
			cls: "callander-modal-button",
		});
		noBtn.addEventListener("click", () => this.close());
		const yesBtn = buttons.createEl("button", {
			text: "Yes",
			cls: "callander-modal-button mod-cta",
		});
		yesBtn.addEventListener("click", () => {
			const markDone = box.checked;
			this.close();
			void this.onYes(markDone);
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
