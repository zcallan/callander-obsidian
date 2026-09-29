import { App } from "obsidian";
import { CallanderModal } from "@/modals/CallanderModal";

/** Which Enter submits: plain, Cmd/Ctrl+Enter (a multi-line field), or
 * Enter unless Shift is held (Shift+Enter for a newline). */
export type SubmitKey = "enter" | "mod-enter" | "enter-unless-shift";

/**
 * A Modal that won't close on an accidental click of the dim backdrop once
 * you've edited anything inside it — so a stray click no longer throws away
 * in-progress input. The ✕ button and Escape still close it normally, and
 * clicks on autocomplete popups (which render outside the modal) are untouched.
 *
 * Also keeps `.callander-modal-buttons` — the Save/Create/Add row every form
 * here ends with — stuck to the bottom of the modal's own scroll, so a form
 * taller than the window never hides its one required action below the
 * fold. Automatic: a subclass just builds that row as it always has, in
 * `onOpen()`, and gets this for free — see base.css's `position: sticky`
 * on `.callander-modal-buttons`. Only the primary (`.mod-cta`) button
 * should float, so the row is marked `is-stuck` while it's stuck and the
 * stylesheet hides the rest until it comes to rest.
 */
export class FormModal extends CallanderModal {
	private ftDirty = false;
	private ftDoc: Document;
	private ftGuard: (evt: Event) => void;
	/**
	 * Stuck vs resting. A sticky row can't be asked directly, and it isn't
	 * clipped when stuck either — sticky holds it inside the scroller's
	 * padding. So each row gets a 1px marker right after it, in normal flow:
	 * the marker sits where the row would rest, and when that spot is out of
	 * view, the row is floating over the form in its place.
	 *
	 * Its only write is a class that changes visibility, never layout —
	 * nothing it does can move the marker and re-trigger it.
	 */
	private ftStuckObserver = new IntersectionObserver((entries) => {
		for (const entry of entries) {
			const row = entry.target.previousElementSibling;
			if (row instanceof HTMLElement) {
				row.toggleClass("is-stuck", !entry.isIntersecting);
			}
		}
	});
	/**
	 * Gives each button row its marker as onOpen builds it — including an
	 * async onOpen, or a form that rebuilds itself. childList only. Inserting
	 * a marker is itself a childList change, so this runs once more after
	 * each insert, finds every row already marked, and stops.
	 */
	private ftRowFinder = new MutationObserver(() => {
		this.contentEl
			.querySelectorAll<HTMLElement>(".callander-modal-buttons")
			.forEach((row) => {
				const next = row.nextElementSibling;
				if (next?.hasClass("callander-modal-buttons-marker")) return;
				const marker = createDiv({
					cls: "callander-modal-buttons-marker",
				});
				row.after(marker);
				this.ftStuckObserver.observe(marker);
			});
	});

	constructor(app: App) {
		super(app);

		const markDirty = () => {
			this.ftDirty = true;
		};
		// input/change bubble, so this catches every field built in onOpen()
		this.contentEl.addEventListener("input", markDirty);
		this.contentEl.addEventListener("change", markDirty);
		// Chips, pills, steppers and swatches are <button>s, not inputs, so
		// picking one fires neither. Any button in the form counts, bar the
		// Save / Cancel row: counting one that edits nothing (a link's Open)
		// costs only a backdrop dismissal — the ✕ and Escape still close —
		// where missing one that does edit throws the pick away.
		this.contentEl.addEventListener("click", (evt) => {
			const t = evt.target as HTMLElement | null;
			const button = t?.closest?.("button");
			if (button && !button.closest(".callander-modal-buttons")) {
				markDirty();
			}
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

		this.ftRowFinder.observe(this.contentEl, {
			childList: true,
			subtree: true,
		});
	}

	/**
	 * Undo whatever focus the modal opened with. Landing focus in the
	 * first field is right for a blank "add" form, but wrong for an edit —
	 * any field is as likely a target as the first, and on mobile the
	 * surprise keyboard covers half the form. Call from onOpen() when the
	 * form opens pre-filled.
	 */
	protected blurInitialFocus() {
		window.setTimeout(() => {
			const el = this.containerEl.ownerDocument.activeElement;
			if (el instanceof HTMLElement && this.containerEl.contains(el)) {
				el.blur();
			}
		}, 0);
	}

	/** Submit from the keyboard in these fields, with the given key. */
	protected submitOnEnter(
		fields: HTMLElement | readonly HTMLElement[],
		submit: () => unknown,
		key: SubmitKey = "enter"
	): void {
		const list = fields instanceof HTMLElement ? [fields] : fields;
		for (const field of list) {
			field.addEventListener("keydown", (event) => {
				// The Enter that confirms a Japanese or Chinese conversion
				// belongs to the input method, not the form: acting on it
				// submitted the half-typed text.
				if (event.key !== "Enter" || event.isComposing) return;
				const mod = event.metaKey || event.ctrlKey;
				if (key === "mod-enter" && !mod) return;
				if (key === "enter-unless-shift" && event.shiftKey) return;
				event.preventDefault();
				void submit();
			});
		}
	}

	/**
	 * Where focus starts: nowhere for a pre-filled form (see
	 * blurInitialFocus), else `first`, on the next tick so it lands after
	 * the modal's own.
	 */
	protected setInitialFocus(first: HTMLElement, prefilled: boolean): void {
		if (prefilled) this.blurInitialFocus();
		else window.setTimeout(() => first.focus(), 0);
	}

	/** Every form's content is built in onOpen, so it's cleared on close.
	 * A subclass with more to tear down calls super.onClose(). */
	onClose() {
		this.contentEl.empty();
	}

	close() {
		this.ftDoc.removeEventListener("mousedown", this.ftGuard, true);
		this.ftDoc.removeEventListener("click", this.ftGuard, true);
		this.ftRowFinder.disconnect();
		this.ftStuckObserver.disconnect();
		super.close();
	}
}
