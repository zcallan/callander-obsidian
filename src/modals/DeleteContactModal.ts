import { App, Modal, TFile } from "obsidian";

export class DeleteContactModal extends Modal {
	constructor(
		app: App,
		private file: TFile,
		private onDelete: () => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Remove friend" });
		contentEl.createEl("p", {
			text: `Are you sure you want to remove ${this.file.basename}? Their note will be moved to your trash.`,
		});

		const buttonContainer = contentEl.createEl("div", {
			cls: "callander-modal-buttons",
		});

		// Cancel button
		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
			cls: "callander-modal-button",
		});
		cancelButton.addEventListener("click", () => this.close());

		// Delete button
		const deleteButton = buttonContainer.createEl("button", {
			text: "Delete",
			cls: "callander-modal-button callander-modal-button-danger",
		});
		deleteButton.addEventListener("click", async () => {
			await this.onDelete();
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
