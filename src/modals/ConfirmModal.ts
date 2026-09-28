import { App, Modal } from "obsidian";
import { guardedAction } from "@/components/guardedAction";

/** Small generic confirmation dialog for destructive actions. */
export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private title: string,
		private message: string,
		private confirmLabel: string,
		private onConfirm: () => void | Promise<void>,
		/** Most things confirmed here are destructive, so the button is
		 * red by default. Ticking a task off isn't — it asks the same
		 * "are you sure?" without dressing it as damage. */
		private tone: "danger" | "normal" = "danger"
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
			cls:
				this.tone === "danger"
					? "callander-modal-button callander-modal-button-danger"
					: "callander-modal-button mod-cta",
		});
		// Once only: most confirmations here delete by position, so a second
		// click would delete whatever had moved into that place.
		const handleConfirm = guardedAction(
			async () => {
				await this.onConfirm();
				this.close();
			},
			{
				buttons: [confirm],
				// "Delete event" → "Couldn't delete event: …"
				failure: `Couldn't ${this.title
					.replace(/\?$/, "")
					.replace(/^./, (first) => first.toLowerCase())}`,
			}
		);
		confirm.addEventListener("click", () => void handleConfirm());
	}

	onClose() {
		this.contentEl.empty();
	}
}
