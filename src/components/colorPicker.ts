import { setIcon } from "obsidian";
import { HexBase } from "vanilla-colorful/lib/entrypoints/hex";
import { normalizeHex, parseColor, toHex } from "@/utils/contrastColor";

/**
 * A colour setting: a swatch, a hex field and a reset, with a proper picker
 * — a saturation square and a hue strip — that opens under the row.
 *
 * The picker is vanilla-colorful's, rather than Obsidian's own
 * `addColorPicker`, which is the browser's bare `<input type="color">`:
 * a different dialog on every platform, and on some of them a grid of
 * presets with no way to nudge a shade. vanilla-colorful is ~3 KB, has no
 * dependencies and needs no framework.
 */

/**
 * Its own tag name, not the package's `hex-color-picker`: custom elements
 * share one registry across every plugin in the window, and a second
 * definition of the same name throws. Imported from the package's
 * internals so nothing is registered until this runs.
 */
const TAG = "callander-hex-picker";

type Picker = HTMLElement & { color: string };

function definePicker() {
	if (!customElements.get(TAG)) {
		customElements.define(TAG, class extends HexBase {});
	}
}

/**
 * A colour as "#rrggbb", read back from how the browser actually draws it
 * — so a theme's `var(--interactive-accent)` or an `hsl()` both become
 * something a picker and a hex field can hold.
 */
export function resolveHex(color: string, within: HTMLElement): string {
	const probe = within.createDiv();
	probe.style.color = color;
	const rgb = parseColor(getComputedStyle(probe).color);
	probe.remove();
	return rgb ? toHex(rgb) : "#000000";
}

/**
 * Stop a drag that has wandered out of the saturation square from dragging
 * the colour with it.
 *
 * The picker clamps a pointer outside the square to its nearest edge, so a
 * drag that slips below the square — easily done, it's a couple of
 * centimetres tall — lands on the bottom row and comes out black. Worse,
 * black is a corner you can't get out of by picking a hue: with brightness
 * at zero every hue is still black, so the picker looks stuck.
 *
 * So while the pointer is outside the square, its moves are dropped and the
 * colour stays where it was last inside. Released outside, the colour is
 * simply the last one you saw. Keyboard moves (arrow keys) aren't touched,
 * and neither is the hue strip.
 *
 * The "move" event is the picker's own internal one, listened for on its
 * shadow root ahead of its own handler — the one liberty this takes with
 * the library's insides, in exchange for not forking it.
 */
function ignoreDragsOutside(picker: Picker) {
	const root = picker.shadowRoot;
	if (!root) return;
	const square = () =>
		root.querySelector<HTMLElement>('[part~="saturation"]');
	let dragging = false;
	let at: { x: number; y: number } | null = null;

	root.addEventListener("pointerdown", (e) => {
		const event = e as PointerEvent;
		const target = event.target as HTMLElement | null;
		dragging = !!target?.closest('[part~="saturation"]');
		at = { x: event.clientX, y: event.clientY };
	});
	// On the document: a drag holds the pointer, so moves past the picker's
	// own edges still arrive, and a release outside still ends the drag.
	const doc = picker.ownerDocument;
	const onMove = (e: PointerEvent) => {
		at = { x: e.clientX, y: e.clientY };
	};
	const onUp = () => {
		dragging = false;
	};
	doc.addEventListener("pointermove", onMove, true);
	doc.addEventListener("pointerup", onUp, true);
	doc.addEventListener("pointercancel", onUp, true);
	// Off again with the picker, which goes when its popover closes.
	new MutationObserver((_records, observer) => {
		if (picker.isConnected) return;
		doc.removeEventListener("pointermove", onMove, true);
		doc.removeEventListener("pointerup", onUp, true);
		doc.removeEventListener("pointercancel", onUp, true);
		observer.disconnect();
	}).observe(doc.body, { childList: true, subtree: true });

	root.addEventListener(
		"move",
		(e) => {
			if (!dragging || !at) return;
			const rect = square()?.getBoundingClientRect();
			if (!rect) return;
			const outside =
				at.x < rect.left ||
				at.x > rect.right ||
				at.y < rect.top ||
				at.y > rect.bottom;
			// Capture phase on the shadow root, so this lands before the
			// picker's own handler there and the move never reaches it.
			if (outside) e.stopPropagation();
		},
		true
	);
}

/** The one picker open at a time — opening another closes it. */
let openPopover: { close: () => void } | null = null;

/** Close whatever colour picker is open — for a modal closing under it. */
export function closeColorPopover() {
	openPopover?.close();
}

export interface ColorPopoverOptions {
	/** The chosen colour as "#rrggbb", or "" for the default. */
	value: string;
	/** What the default is — any CSS colour, including a var(). */
	fallback: string;
	onChange: (value: string) => void;
	/** Offer a hex field under the picker, for typing a colour in. */
	withHex?: boolean;
	/** Offer a way back to the default; the value becomes "". */
	onReset?: () => void;
	/** Told when the picker closes, however it closes. */
	onClose?: () => void;
}

/**
 * A colour picker floating over the page, anchored to what opened it —
 * below it, or above when there's no room below, and kept on screen
 * sideways. Closes on a click anywhere outside it, or Escape (which
 * doesn't then also close a modal behind it).
 *
 * Attached to the document body at the menu layer, so it sits over a
 * modal rather than inside one — and so a modal's own "don't close on a
 * stray click" guard never sees clicks on it.
 */
export function openColorPopover(
	anchor: HTMLElement,
	opts: ColorPopoverOptions
): { close: () => void } {
	openPopover?.close();
	definePicker();
	const doc = anchor.ownerDocument;
	const pop = doc.body.createDiv({ cls: "callander-color-popover" });
	const picker = pop.createEl(TAG as "div") as unknown as Picker;
	picker.color = opts.value || resolveHex(opts.fallback, anchor);

	let hex: HTMLInputElement | null = null;
	if (opts.withHex || opts.onReset) {
		const foot = pop.createDiv({ cls: "callander-color-popover-foot" });
		if (opts.withHex) {
			const input = foot.createEl("input", {
				cls: "callander-color-hex",
				attr: { type: "text", spellcheck: "false", maxlength: "7" },
			});
			input.value = opts.value;
			input.placeholder = "Default";
			input.addEventListener("change", () => {
				const typed = normalizeHex(input.value);
				if (!typed) {
					input.value = picker.color;
					return;
				}
				picker.color = typed;
				opts.onChange(typed);
			});
			hex = input;
		}
		const onReset = opts.onReset;
		if (onReset) {
			const reset = foot.createEl("button", {
				cls: "callander-button callander-color-popover-reset",
				text: "Reset",
				attr: { type: "button" },
			});
			reset.addEventListener("click", () => {
				onReset();
				close();
			});
		}
	}
	ignoreDragsOutside(picker);
	picker.addEventListener("color-changed", (e) => {
		const value = (e as CustomEvent<{ value: string }>).detail.value;
		if (hex) hex.value = value;
		opts.onChange(value);
	});

	// Placed once it has a size to place.
	const r = anchor.getBoundingClientRect();
	const vw = doc.documentElement.clientWidth;
	const vh = doc.documentElement.clientHeight;
	const w = pop.offsetWidth;
	const h = pop.offsetHeight;
	const left = Math.min(Math.max(8, r.left), vw - w - 8);
	let top = r.bottom + 6;
	if (top + h > vh - 8) top = Math.max(8, r.top - h - 6);
	pop.style.left = `${left}px`;
	pop.style.top = `${top}px`;

	const onDown = (e: PointerEvent) => {
		const target = e.target as Node | null;
		// The anchor toggles the picker itself — closing here as well would
		// have its click open a fresh one straight away.
		if (target && (pop.contains(target) || anchor.contains(target))) return;
		close();
	};
	const onKey = (e: KeyboardEvent) => {
		if (e.key !== "Escape") return;
		e.preventDefault();
		e.stopPropagation();
		close();
	};
	doc.addEventListener("pointerdown", onDown, true);
	doc.addEventListener("keydown", onKey, true);

	const close = () => {
		doc.removeEventListener("pointerdown", onDown, true);
		doc.removeEventListener("keydown", onKey, true);
		pop.remove();
		if (openPopover === handle) openPopover = null;
		opts.onClose?.();
	};
	const handle = { close };
	openPopover = handle;
	return handle;
}

/**
 * Below this, a row's swatch, hex field and reset button no longer leave
 * room for the label — matches the calendar's own narrow-pane breakpoint
 * (CAL_NARROW), so the two settle on "mobile-shaped" the same way. The
 * window, not the device: a split pane or a resized window this narrow
 * needs the same fix a phone does.
 */
const NARROW_ROW = 600;

/** Is the row's own window this narrow right now? A modal's own width
 * isn't a reliable signal — Obsidian sizes some modals to the window
 * regardless of content — so this reads the window a row's document
 * belongs to, which is what actually runs out of room. */
function isNarrowRow(el: HTMLElement): boolean {
	const view = el.ownerDocument.defaultView;
	return (view ?? window).innerWidth <= NARROW_ROW;
}

export interface ColorRowOptions {
	label: string;
	/** The chosen colour as "#rrggbb", or "" for the default. */
	value: string;
	/** What the default is — any CSS colour, including a var(). */
	fallback: string;
	onChange: (value: string) => void;
}

export function appendColorRow(parent: HTMLElement, opts: ColorRowOptions) {
	definePicker();
	const row = parent.createDiv({ cls: "callander-color-row" });
	const head = row.createDiv({ cls: "callander-color-row-head" });
	head.createSpan({ cls: "callander-color-row-label", text: opts.label });
	const controls = head.createDiv({ cls: "callander-color-row-controls" });
	const swatch = controls.createEl("button", {
		cls: "callander-color-swatch",
		attr: { type: "button", "aria-label": `Pick a color for ${opts.label}` },
	});
	// At a narrow width, a row of these plus a hex field left no room for
	// the label — it's the popover's hex field (below) that gets typed
	// into there instead.
	const input = isNarrowRow(row)
		? null
		: controls.createEl("input", {
				cls: "callander-color-hex",
				attr: { type: "text", spellcheck: "false", maxlength: "7" },
		  });
	const reset = controls.createEl("button", {
		cls: "clickable-icon callander-color-reset",
		attr: { type: "button", "aria-label": "Back to the default" },
	});
	setIcon(reset, "rotate-ccw");
	let value = opts.value;
	let popover: { close: () => void } | null = null;
	const current = () => value || resolveHex(opts.fallback, row);

	const paint = () => {
		swatch.style.background = value || opts.fallback;
		if (input) {
			input.value = value;
			input.placeholder = "Default";
		}
		// Faded rather than hidden: still there and clickable (a no-op on a
		// default value), so the row's width never shifts, and a barely-there
		// reset still hints there's a default to fall back to.
		reset.toggleClass("is-default", !value);
	};

	const set = (next: string) => {
		value = next;
		paint();
		opts.onChange(next);
	};

	swatch.addEventListener("click", () => {
		if (popover) {
			popover.close();
			return;
		}
		row.addClass("is-open");
		popover = openColorPopover(swatch, {
			value: current(),
			fallback: opts.fallback,
			// No inline field at this width to type into instead — the
			// popover carries its own.
			withHex: !input,
			onChange: set,
			onClose: () => {
				popover = null;
				row.removeClass("is-open");
			},
		});
	});

	// Typed colours land on blur or Enter, not per keystroke — "#a" on its
	// way to "#abcdef" isn't a colour anyone meant.
	input?.addEventListener("change", () => {
		const raw = input.value.trim();
		if (raw === "") return set("");
		const hex = normalizeHex(raw);
		if (hex) set(hex);
		else paint();
	});
	reset.addEventListener("click", () => {
		popover?.close();
		set("");
	});

	paint();
}
