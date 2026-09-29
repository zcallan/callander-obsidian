import { setIcon } from "obsidian";
import { fieldLabel, type FieldHelp } from "@/utils/fieldLabel";

/**
 * The About section's field-help popover: one open at a time, with the
 * document listeners that dismiss it.
 *
 * Owned by the view rather than per field, so opening one can close the
 * last, and so the view's onClose can tear down listeners that would
 * otherwise outlive the page.
 */
export class FieldHelpPopover {
	private current: {
		anchor: HTMLElement;
		el: HTMLElement;
		button: HTMLElement;
		dispose: () => void;
	} | null = null;

	/** `doc` is the page's own document, which a popout window changes. */
	constructor(private readonly doc: () => Document) {}

	/** Is the popover open on this anchor? */
	isOpenAt(anchor: HTMLElement): boolean {
		return this.current?.anchor === anchor;
	}

	/** Close whichever is open, and drop its listeners. */
	close(): void {
		const open = this.current;
		if (!open) return;
		this.current = null;
		open.dispose();
		open.el.remove();
		open.button.setAttribute("aria-expanded", "false");
		open.button.removeClass("is-open");
	}

	/** Open `help` for field `key` at `anchor`, closing any other. */
	open(
		anchor: HTMLElement,
		button: HTMLElement,
		key: string,
		help: FieldHelp
	): void {
		this.close();

		const el = anchor.createDiv({ cls: "contact-field-help" });
		// Arrow first in the DOM so it paints behind the box's own border.
		el.createDiv({ cls: "contact-field-help-arrow" });

		const header = el.createDiv({ cls: "contact-field-help-header" });
		header.createDiv({
			cls: "contact-field-help-title",
			text: fieldLabel(key),
		});
		const close = header.createEl("button", {
			cls: "contact-field-help-close",
			attr: { type: "button", "aria-label": "Close" },
		});
		setIcon(close, "x");
		close.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.close();
		});

		el.createDiv({ cls: "contact-field-help-text", text: help.text });
		if (help.example) {
			el.createDiv({
				cls: "contact-field-help-example",
				text: `e.g. ${help.example}`,
			});
		}

		// A click that lands anywhere but inside this box closes it. Bound on
		// the next frame so the click that opened it doesn't immediately
		// dismiss it as it finishes bubbling.
		const onDocClick = (evt: MouseEvent) => {
			const target = evt.target as Node | null;
			if (target && el.contains(target)) return;
			this.close();
		};
		const onKey = (evt: KeyboardEvent) => {
			if (evt.key === "Escape") this.close();
		};
		const doc = this.doc();
		const timer = window.setTimeout(() => {
			doc.addEventListener("click", onDocClick);
			doc.addEventListener("keydown", onKey);
		}, 0);

		button.setAttribute("aria-expanded", "true");
		button.addClass("is-open");
		this.current = {
			anchor,
			el,
			button,
			dispose: () => {
				window.clearTimeout(timer);
				doc.removeEventListener("click", onDocClick);
				doc.removeEventListener("keydown", onKey);
			},
		};
	}
}
