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

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		const cancel = buttons.createEl("button", {
			text: "Cancel",
			cls: "callander-modal-button",
		});
		cancel.addEventListener("click", () => this.close());

		const confirm = buttons.createEl("button", {
			text: this.confirmLabel,
			cls: "callander-modal-button callander-modal-button-danger",
		});
		const handleConfirm = async () => {
			await this.onConfirm();
			this.close();
		};
		confirm.addEventListener("click", () => void handleConfirm());
	}

	onClose() {
		this.contentEl.empty();
	}
}
