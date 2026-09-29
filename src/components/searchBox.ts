export interface SearchBoxOptions {
	placeholder: string;
	cls: string;
	/** The query so far, which a rebuilt box starts from. */
	value: string;
	onInput: (value: string) => void;
}

/** Where the caret was, as the input reports it. */
interface HeldCaret {
	start: number | null;
	end: number | null;
	direction: "forward" | "backward" | "none" | null;
}

/**
 * A page's search box that keeps its place when the page redraws around it.
 *
 * Every page rebuilds its toolbar on a full render, and a full render lands
 * whenever the vault changes: a sync arriving, an edit in another pane. The
 * fresh input is seeded with the query, but focus and the caret don't come
 * across, so whoever is typing stops dead mid-word.
 *
 * Focus can't be read back afterwards — once the page has emptied itself,
 * the old box is detached and the document's focus is on the body — so the
 * page calls `hold()` just before it empties, and the next `build()` hands
 * the new box the same focus and selection.
 */
export class SearchBox {
	private input: HTMLInputElement | null = null;
	private held: HeldCaret | null = null;

	/** Note whether the live box has focus. Call before the page empties. */
	hold(): void {
		const input = this.input;
		this.held =
			input && input.ownerDocument.activeElement === input
				? {
						start: input.selectionStart,
						end: input.selectionEnd,
						direction: input.selectionDirection,
				  }
				: null;
	}

	/** The box, in `parent`, focused again if the last one was held so. */
	build(parent: HTMLElement, options: SearchBoxOptions): HTMLInputElement {
		const input = parent.createEl("input", {
			attr: { type: "text", placeholder: options.placeholder },
			cls: options.cls,
		});
		input.value = options.value;
		input.addEventListener("input", () => options.onInput(input.value));
		this.input = input;

		const held = this.held;
		this.held = null;
		if (held) {
			// Without preventScroll, focusing scrolls the box into view,
			// and the page restores its own scroll position anyway.
			input.focus({ preventScroll: true });
			const end = input.value.length;
			input.setSelectionRange(
				held.start ?? end,
				held.end ?? end,
				held.direction ?? "none"
			);
		}
		return input;
	}
}
