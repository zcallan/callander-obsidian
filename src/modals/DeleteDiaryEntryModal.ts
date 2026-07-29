import { App, Modal } from "obsidian";

export class DeleteDiaryEntryModal extends Modal {
	constructor(
		app: App,
		private entryTitle: string,
		private onDelete: () => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Delete diary entry" });
		contentEl.createEl("p", {
			text: `Are you sure you want to delete "${this.entryTitle}"? It will be moved to your trash.`,
		});

		const buttonContainer = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});

		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
			cls: "callander-modal-button",
		});
		cancelButton.addEventListener("click", () => this.close());

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
		this.contentEl.empty();
	}
}
