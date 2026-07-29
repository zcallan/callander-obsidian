import { App, Modal } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type { ContactWithCountdown } from "@/types";

/** Confirmation step for merging duplicate friends. */
export class MergeFriendsModal extends FormModal {
	constructor(
		app: App,
		private keep: ContactWithCountdown,
		private duplicate: ContactWithCountdown,
		private onConfirm: () => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Merge friends" });
		contentEl.createEl("p", {
			text: `Merge "${this.duplicate.displayName}" into "${this.keep.displayName}"?`,
		});
		const list = contentEl.createEl("ul", { cls: "glance-list" });
		list.createEl("li", {
			text: `${this.keep.displayName} keeps all their own details; missing fields are filled from ${this.duplicate.displayName}`,
		});
		list.createEl("li", {
			text: "Ideas, events, groups, and notes are combined",
		});
		list.createEl("li", {
			text: `${this.duplicate.displayName}'s note is moved to your trash`,
		});

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		const cancel = buttons.createEl("button", {
			text: "Cancel",
			cls: "callander-modal-button",
		});
		cancel.addEventListener("click", () => this.close());
		const confirm = buttons.createEl("button", {
			text: "Merge",
			cls: "callander-modal-button callander-modal-button-danger",
		});
		confirm.addEventListener("click", async () => {
			await this.onConfirm();
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
