/** A button's own keys: Enter, or Space. */
export function isActivationKey(e: Pick<KeyboardEvent, "key">): boolean {
	return e.key === "Enter" || e.key === " ";
}

/**
 * A keydown handler that runs `onActivate` for Enter or Space pressed on
 * the element it's attached to. Not for a key held down, which would open
 * a modal per repeat, and not for a key meant for a control inside it: a
 * button in a row answers its own Enter.
 */
export function activationKeyHandler(
	onActivate: (e: KeyboardEvent) => void
): (e: KeyboardEvent) => void {
	return (e) => {
		if (e.target !== e.currentTarget || e.repeat || !isActivationKey(e)) {
			return;
		}
		// Space would scroll the page, and Enter reach a form's submit.
		e.preventDefault();
		onActivate(e);
	};
}

export interface ActivatableOptions {
	/** "link" for something that goes to another page; a button otherwise. */
	role?: "button" | "link";
	/** What a screen reader says, where the element's own text doesn't. */
	label?: string;
	/**
	 * Keys only: the element's row keeps the click. For the title of a row
	 * that holds buttons of its own, which can't be a button itself (a
	 * button in a button is lost to a screen reader); the title is where
	 * the keyboard reaches the row instead. A screen reader's own "click"
	 * on it bubbles to the row as a mouse click does.
	 */
	keysOnly?: boolean;
	/** Finds the element again after a redraw — see setFocusKey. */
	focusKey?: string;
}

/**
 * A clickable row, cell, chip or header that isn't a <button> made to work
 * as one from the keyboard: reachable by Tab, announced as a button, and
 * run by Enter or Space as well as a click. They're divs for their layout's
 * sake — a <button> would bring Obsidian's fill, shadow and padding into
 * every row.
 *
 * `callander-activatable` is what base.css draws the focus ring on, since
 * Obsidian draws its own only on real buttons.
 */
export function makeActivatable(
	el: HTMLElement,
	onActivate: (e: MouseEvent | KeyboardEvent) => void,
	{ role = "button", label, keysOnly = false, focusKey }: ActivatableOptions = {}
): void {
	el.addClass("callander-activatable");
	el.setAttribute("role", role);
	el.tabIndex = 0;
	if (label) el.setAttribute("aria-label", label);
	if (focusKey) setFocusKey(el, focusKey);
	const run = (e: MouseEvent | KeyboardEvent) =>
		keepingFocus(el, () => onActivate(e));
	if (!keysOnly) el.addEventListener("click", run);
	el.addEventListener("keydown", activationKeyHandler(run));
}

/**
 * An accordion's header as a disclosure button: activatable, and saying
 * whether its section is expanded. `toggle` flips the open state, and with
 * it `wrap`'s `is-open` class, each page keeping that state its own way.
 */
export function makeDisclosure(
	header: HTMLElement,
	wrap: HTMLElement,
	toggle: () => void,
	focusKey?: string
): void {
	const say = () =>
		header.setAttribute("aria-expanded", String(wrap.hasClass("is-open")));
	makeActivatable(
		header,
		() => {
			toggle();
			say();
		},
		{ focusKey }
	);
	say();
}

/**
 * What finds an element again when its page is redrawn, so keyboard focus
 * can come back to its successor rather than drop to the top of the page.
 * Unique within the page: a note's path, a day, a pill's row and label.
 */
export function setFocusKey(el: HTMLElement, key: string): void {
	el.dataset.focusKey = key;
}

/** The element carrying `key` in `scope`, focused without scrolling. */
function refocus(scope: HTMLElement, key: string): void {
	for (const el of Array.from(
		scope.querySelectorAll<HTMLElement>("[data-focus-key]")
	)) {
		if (el.dataset.focusKey === key) {
			el.focus({ preventScroll: true });
			return;
		}
	}
}

/**
 * Run `action`, and if it redrew `el` away while it had focus — a calendar
 * picking its day, the diary opening an entry — focus its successor, found
 * by the focus key `el` carries. For a <button> that redraws its page, and
 * what makeActivatable's elements do on their own.
 */
export function keepingFocus(el: HTMLElement, action: () => void): void {
	const doc = el.ownerDocument;
	const scope =
		el.closest<HTMLElement>(".view-content, .modal-content") ?? doc.body;
	const hadFocus = doc.activeElement === el;
	action();
	const key = el.dataset.focusKey;
	if (key && hadFocus && !el.isConnected) refocus(scope, key);
}

/**
 * Keeps keyboard focus across a page's own redraws — a vault change, a
 * setting saved — the way SearchBox keeps the caret. The page calls
 * hold() before it empties and restore() once drawn; only elements with
 * a focus key are found again.
 */
export class FocusKeeper {
	private key: string | null = null;

	/** Note which keyed element has focus. Call before the page empties. */
	hold(container: HTMLElement): void {
		// Read off the element rather than checked with instanceof, which
		// fails across a popout window's realm.
		const active = container.ownerDocument.activeElement as HTMLElement | null;
		this.key =
			active && container.contains(active)
				? active.dataset?.focusKey ?? null
				: null;
	}

	/** Give focus back to the held element's successor. Call once drawn. */
	restore(container: HTMLElement): void {
		const key = this.key;
		this.key = null;
		if (key) refocus(container, key);
	}
}
