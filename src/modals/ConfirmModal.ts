import { App, Modal } from "obsidian";

/** Small generic confirmation dialog for destructive actions. */
export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private title: string,
		private message: string,
		private confirmLabel: string,
		private onConfirm: () => void | Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: this.title });
		contentEl.createEl("p", { text: this.message });

		const buttons = contentEl.createEl("div", {
			cls: "friend-tracker-modal-buttons",
		});
		const cancel = buttons.createEl("button", {
			text: "Cancel",
			cls: "friend-tracker-modal-button",
		});
		cancel.addEventListener("click", () => this.close());

		const confirm = buttons.createEl("button", {
			text: this.confirmLabel,
			cls: "friend-tracker-modal-button friend-tracker-modal-button-danger",
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
