import { App, Modal } from "obsidian";
import { guardedAction } from "@/components/guardedAction";
import { CallanderModal } from "@/modals/CallanderModal";

/** How much of an item's text a delete confirmation quotes. */
export const CONFIRM_PREVIEW_CHARS = 80;

export interface ConfirmOptions {
	title: string;
	message: string;
	/** The confirm button's label; "Delete" unless said. */
	confirmLabel?: string;
	onConfirm: () => void | Promise<void>;
	/** Most things confirmed here are destructive, so the button is red by
	 * default. Ticking a task off isn't — it asks the same "are you sure?"
	 * without dressing it as damage. */
	tone?: "danger" | "normal";
	/** What a failure says; worked out from the title unless given. */
	failure?: string;
}

/** Small generic confirmation dialog for destructive actions. */
export class ConfirmModal extends CallanderModal {
	constructor(
		app: App,
		private opts: ConfirmOptions
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		const { title, message, tone = "danger" } = this.opts;
		contentEl.createEl("h2", { text: title });
		contentEl.createEl("p", { text: message });

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		const cancel = buttons.createEl("button", {
			text: "Cancel",
			cls: "callander-modal-button",
		});
		cancel.addEventListener("click", () => this.close());

		const confirm = buttons.createEl("button", {
			text: this.opts.confirmLabel ?? "Delete",
			cls:
				tone === "danger"
					? "callander-modal-button callander-modal-button-danger"
					: "callander-modal-button mod-cta",
		});
		// Once only: most confirmations here delete by position, so a second
		// click would delete whatever had moved into that place.
		const handleConfirm = guardedAction(
			async () => {
				await this.opts.onConfirm();
				this.close();
			},
			{
				buttons: [confirm],
				// "Delete event" → "Couldn't delete event: …"
				failure:
					this.opts.failure ??
					`Couldn't ${title
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

/**
 * Confirm, then run `onConfirm` and close `host` as well: the delete button
 * on an edit or read view, where the item it shows is gone afterwards.
 */
export function confirmThenClose(host: Modal, opts: ConfirmOptions): void {
	new ConfirmModal(host.app, {
		...opts,
		onConfirm: async () => {
			await opts.onConfirm();
			host.close();
		},
	}).open();
}
