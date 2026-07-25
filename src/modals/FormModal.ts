import { App, Modal } from "obsidian";

/**
 * A Modal that won't close on an accidental click of the dim backdrop once
 * you've edited anything inside it — so a stray click no longer throws away
 * in-progress input. The ✕ button and Escape still close it normally, and
 * clicks on autocomplete popups (which render outside the modal) are untouched.
 */
export class FormModal extends Modal {
	private ftDirty = false;
	private ftDoc: Document;
	private ftGuard: (evt: Event) => void;

	constructor(app: App) {
		super(app);

		const markDirty = () => {
			this.ftDirty = true;
		};
		// input/change bubble, so this catches every field built in onOpen()
		this.contentEl.addEventListener("input", markDirty);
		this.contentEl.addEventListener("change", markDirty);
		// Selection chips (category / priority / type / split mode) are
		// <button>s, not inputs — count picking one as an edit too.
		this.contentEl.addEventListener("click", (evt) => {
			const t = evt.target as HTMLElement | null;
			if (t?.closest?.(".quick-idea-category-button")) markDirty();
		});

		this.ftDoc = this.containerEl.ownerDocument;
		this.ftGuard = (evt: Event) => {
			if (!this.ftDirty) return;
			const el = evt.target as HTMLElement | null;
			if (!el) return;
			// Only the dim backdrop of THIS modal: inside its container but
			// outside the box, and not the ✕. Suggestion popups live outside
			// containerEl, so they're never blocked.
			if (!this.containerEl.contains(el)) return;
			if (this.modalEl.contains(el)) return;
			if (el.closest?.(".modal-close-button")) return;
			evt.preventDefault();
			evt.stopImmediatePropagation();
			// Nudge once (on click) so it's clear the click was intentional-
			// looking but ignored; mousedown is blocked silently.
			if (evt.type !== "click") return;
			this.modalEl.removeClass("ft-modal-shake");
			void this.modalEl.offsetWidth; // reflow so it re-triggers
			this.modalEl.addClass("ft-modal-shake");
		};
		// Capture phase at the document root: fires before Obsidian's own
		// background-click handler, so we can veto the close.
		this.ftDoc.addEventListener("mousedown", this.ftGuard, true);
		this.ftDoc.addEventListener("click", this.ftGuard, true);
	}

	close() {
		this.ftDoc.removeEventListener("mousedown", this.ftGuard, true);
		this.ftDoc.removeEventListener("click", this.ftGuard, true);
		super.close();
	}
}
