/**
 * Mobile keyboard tracking: keeps a modal's inputs visible above the
 * on-screen keyboard by publishing its height as a CSS variable on the
 * body, and a class while it's open, for base.css to lay modals out by.
 */

import { Platform, type Component } from "obsidian";

/** The body's CSS variable holding the keyboard's height in px. */
export const KEYBOARD_INSET_VAR = "--callander-keyboard-inset";

/** The share of the screen assumed covered when the OS won't say. */
const KEYBOARD_FALLBACK_HEIGHT_RATIO = 0.42;
const fallbackKeyboardInset = () =>
	Math.round(window.innerHeight * KEYBOARD_FALLBACK_HEIGHT_RATIO);
/** An inset below this means the keyboard isn't really accounted for. */
const MIN_KEYBOARD_INSET_PX = 30;
/** Re-checks after focus, once the OS's own resizing has settled. */
const KEYBOARD_ASSIST_DELAYS_MS = [350, 900] as const;
/** How long focus gets to land somewhere new before the inset drops. */
const FOCUS_SETTLE_MS = 150;

/** The keyboard height last published, in px; 0 when it's closed. */
export function currentKeyboardInset(doc: Document = document): number {
	return parseInt(doc.body.style.getPropertyValue(KEYBOARD_INSET_VAR)) || 0;
}

/**
 * Does focusing this bring up the keyboard? Only a text field in one of
 * Callander's modals (CallanderModal's marker): the layout this drives is
 * for them, and it used to take hold of Obsidian's Settings and every
 * other plugin's dialogs too.
 * Selects and native date/month/time inputs open iOS wheel pickers, NOT the
 * keyboard — no keyboard events ever fire for them, so the focus fallback
 * must not fake an inset for them, and a hide event while one is focused
 * is real. Checked by tagName rather than instanceof, which fails across
 * popout windows.
 */
export function summonsKeyboard(el: Element | null): el is HTMLElement {
	if (!el || !el.closest(".callander-modal")) return false;
	if (el.tagName === "TEXTAREA") return true;
	if (el.tagName !== "INPUT") return false;
	return ![
		"date",
		"month",
		"time",
		"checkbox",
		"radio",
		"range",
	].includes((el as HTMLInputElement).type);
}

/** Tracks the keyboard for as long as `owner` is loaded; mobile only. */
export function installKeyboardInsetTracking(owner: Component): void {
	if (!Platform.isMobile) return;

	const setInset = (px: number) => {
		const value = Math.max(0, Math.round(px));
		document.body.style.setProperty(KEYBOARD_INSET_VAR, `${value}px`);
		// Lets CSS confine modals to the space above the keyboard —
		// padding alone can't help a modal whose content fits without
		// scrolling (it just extends underneath, unreachable)
		document.body.toggleClass("callander-kb-open", value > 0);
	};


	// Primary: Capacitor's native keyboard events (Obsidian mobile is
	// Capacitor; on iOS the webview often does NOT resize for the
	// keyboard, so visualViewport alone sees nothing)
	const onShow = (event: Event) => {
		// Capacitor's keyboard event carries the height; not in DOM typings
		const height = Number(
			(event as Event & { keyboardHeight?: unknown }).keyboardHeight
		);
		setInset(
			Number.isFinite(height) && height > 0
				? height
				: fallbackKeyboardInset()
		);
	};
	const onHide = () => {
		// iOS emits a stray keyboardWillHide during some modals' open
		// sequence while a text field still holds focus — honoring it
		// buries the field with no inset. A real dismissal blurs the
		// field, and the focusout handler tears the inset down then.
		if (summonsKeyboard(document.activeElement)) return;
		setInset(0);
	};
	for (const type of ["keyboardWillShow", "keyboardDidShow"]) {
		window.addEventListener(type, onShow);
	}
	for (const type of ["keyboardWillHide", "keyboardDidHide"]) {
		window.addEventListener(type, onHide);
	}
	owner.register(() => {
		for (const type of ["keyboardWillShow", "keyboardDidShow"]) {
			window.removeEventListener(type, onShow);
		}
		for (const type of ["keyboardWillHide", "keyboardDidHide"]) {
			window.removeEventListener(type, onHide);
		}
		document.body.style.removeProperty(
			KEYBOARD_INSET_VAR
		);
	});

	// Secondary: visualViewport, when the webview does resize
	const vv = window.visualViewport;
	if (vv) {
		const update = () => {
			const inset =
				window.innerHeight - vv.height - vv.offsetTop;
			if (inset > 30) setInset(inset);
		};
		vv.addEventListener("resize", update);
		owner.register(() =>
			vv.removeEventListener("resize", update)
		);
	}

	// Focus assist + last-resort fallback: if nothing reported a
	// keyboard by the time the animation is done, assume one
	owner.registerDomEvent(document, "focusin", (event) => {
		const target = event.target as HTMLElement | null;
		if (summonsKeyboard(target)) {
			// Two-shot: iOS keyboard churn on some modals can zero the
			// inset AFTER the first check has passed — re-verify once
			// the churn has had time to settle
			const assist = (delay: number, scroll: boolean) =>
				window.setTimeout(() => {
					if (document.activeElement !== target) return;
					if (currentKeyboardInset() < MIN_KEYBOARD_INSET_PX) {
						setInset(fallbackKeyboardInset());
					}
					// Not the colour picker's hex field: the picker is
					// position: fixed and moves itself clear of the
					// keyboard (see openColorPopover) — scrolling for it
					// would only shift the modal underneath.
					if (
						scroll &&
						!target.closest(".callander-color-popover")
					) {
						target.scrollIntoView({
							block: "center",
							behavior: "smooth",
						});
					}
				}, delay);
			const [first, second] = KEYBOARD_ASSIST_DELAYS_MS;
			assist(first, true);
			assist(second, false);
		}
	});

	// Keystrokes are proof the keyboard is open — heal the inset if
	// event churn zeroed it while typing
	owner.registerDomEvent(document, "input", (event) => {
		const target = event.target as HTMLElement | null;
		if (
			summonsKeyboard(target) &&
			currentKeyboardInset() < MIN_KEYBOARD_INSET_PX
		) {
			setInset(fallbackKeyboardInset());
		}
	});

	// Drop the inset when focus moves off keyboard-summoning controls —
	// including onto a select/date picker, where the keyboard closes
	owner.registerDomEvent(document, "focusout", () => {
		window.setTimeout(() => {
			const active = document.activeElement as HTMLElement | null;
			if (!summonsKeyboard(active)) setInset(0);
		}, FOCUS_SETTLE_MS);
	});
}
