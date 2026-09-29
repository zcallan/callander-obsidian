import { App, Modal } from "obsidian";

/**
 * Obsidian's Modal, marked as one of Callander's.
 *
 * base.css keeps its modal rules (the mobile keyboard handling, the scroll
 * containers, the iOS date-input fixes) to these marker classes rather than
 * Obsidian's own .modal, .modal-content and .modal-container, which
 * Obsidian's Settings and every other plugin's dialogs share. Written
 * against those, they restyled all of them.
 *
 * So every modal here extends this (FormModal does), or it goes without
 * those rules, the iOS keyboard handling included: summonsKeyboard only
 * lifts a field inside `.callander-modal`. modal-base.test.mjs checks.
 */
export class CallanderModal extends Modal {
	constructor(app: App) {
		super(app);
		this.containerEl.addClass("callander-modal-container");
		this.modalEl.addClass("callander-modal");
		this.contentEl.addClass("callander-modal-content");
	}
}

/**
 * The same mark for a suggester, which can't extend CallanderModal.
 * Obsidian rebuilds its box as a `.prompt`, dropping `.modal` and the
 * content element, so only the container takes the class: it's the part
 * the keyboard rules pad, and the one rule that ever reached a suggester.
 */
export function markCallanderSuggester(modal: {
	containerEl: HTMLElement;
}): void {
	modal.containerEl.addClass("callander-modal-container");
}
