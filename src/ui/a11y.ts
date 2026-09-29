import {
	activationKeyHandler,
	type ActivatableOptions,
} from "@/components/activatable";

/**
 * makeActivatable's props for JSX: spread onto a clickable div, span or
 * row, with the element's own class passed in, so it can be reached and
 * run from the keyboard. See makeActivatable for what each option means.
 *
 * No keepingFocus here: React keeps the element across its own renders,
 * and a page redraw that moves the island is FocusKeeper's to answer,
 * which finds the element by the same `data-focus-key`.
 */
export function activatable(
	onActivate: (e: MouseEvent | KeyboardEvent) => void,
	className = "",
	{ role = "button", label, keysOnly = false, focusKey }: ActivatableOptions = {}
) {
	return {
		role,
		tabIndex: 0,
		className: ["callander-activatable", className].filter(Boolean).join(" "),
		...(label && { "aria-label": label }),
		...(focusKey && { "data-focus-key": focusKey }),
		...(!keysOnly && { onClick: onActivate }),
		onKeyDown: activationKeyHandler(onActivate),
	};
}
