import { setIcon } from "obsidian";
import { makeDisclosure } from "@/components/activatable";

export interface ModalAccordion {
	/** Where the folded-away fields go. */
	body: HTMLElement;
	/** Open or close it — open from the start for an edit with saved
	 * detail, which mustn't hide behind a closed lid. */
	setOpen(open: boolean): void;
}

/**
 * A form's "Additional details": a header that folds the optional fields
 * away, so the form leads with what it's for. Closed until told otherwise;
 * a modal opens fresh every time, so unlike the pages' accordions there's
 * no remembered state.
 *
 * The header is a disclosure button to a keyboard as well as a mouse:
 * focusable, toggled by Enter or Space, and saying whether it's expanded.
 * Each form's own copy was a bare div that Tab went straight past, which
 * left everything inside out of a keyboard's reach.
 */
export function appendModalAccordion(
	parent: HTMLElement,
	label = "Additional details"
): ModalAccordion {
	const wrap = parent.createDiv({
		cls: "callander-modal-field plan-accordion callander-modal-accordion",
	});
	const header = wrap.createDiv({
		cls: "plan-accordion-header callander-modal-accordion-header",
	});
	header.createSpan({ text: label });
	setIcon(header.createSpan({ cls: "plan-accordion-chevron" }), "chevron-down");
	const body = wrap.createDiv({ cls: "plan-accordion-body" });

	makeDisclosure(header, wrap, () =>
		wrap.toggleClass("is-open", !wrap.hasClass("is-open"))
	);
	const setOpen = (open: boolean) => {
		wrap.toggleClass("is-open", open);
		header.setAttribute("aria-expanded", String(open));
	};
	return { body, setOpen };
}
