import { App, Modal } from "obsidian";

/**
 * Shown right after a Someday has been promoted into a Plan. The plan already
 * exists and the someday is already linked to it; this only asks whether to
 * keep the someday around as a breadcrumb or remove it. Dismissing (Esc / ✕)
 * keeps it — the safe default.
 */
export class ConvertSomedayModal extends Modal {
	constructor(
		app: App,
		private somedayName: string,
		private onChoice: (keep: boolean) => void | Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Opened as a plan" });
		contentEl.createEl("p", {
			text: `"${this.somedayName}" is now a plan. Keep the someday as a reminder, or remove it?`,
		});

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		const removeBtn = buttons.createEl("button", {
			text: "Remove someday",
			cls: "callander-modal-button",
		});
		removeBtn.addEventListener("click", async () => {
			await this.onChoice(false);
			this.close();
		});
		const keepBtn = buttons.createEl("button", {
			text: "Keep it",
			cls: "callander-modal-button mod-cta",
		});
		keepBtn.addEventListener("click", async () => {
			await this.onChoice(true);
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
