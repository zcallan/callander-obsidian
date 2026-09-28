import { openColorPopover } from "@/components/colorPicker";

export interface ColorSwatchRowOptions {
	palette: readonly string[];
	/** The current hand-picked colour, or "" for nothing hand-picked yet —
	 * only meaningful together with `resetTo`, which is what's shown and
	 * selected in that case. Group has no such state: it always passes a
	 * real colour here. */
	initial: string;
	/** What the popover opens showing when the custom slot has no colour
	 * of its own yet. */
	customFallback: string;
	/**
	 * Offers a Reset control in the custom popover, and what it restores —
	 * the colour shown and selected whenever nothing's been hand-picked.
	 * Omit where a colour is mandatory and there's no "default" to fall
	 * back to (Group).
	 */
	resetTo?: string;
	onChange: (color: string) => void;
}

export interface ColorSwatchRowHandle {
	/** "" means nothing's been hand-picked — only reachable with `resetTo`
	 * set, and the caller should treat it as "use the default", not as a
	 * real colour. */
	getColor(): string;
}

/**
 * A row of preset colour dots plus a custom slot — Group's own picker,
 * lifted out so anything else that wants "pick one of these, or your own"
 * (an event category) can have the identical control rather than a
 * lookalike that drifts from it over time.
 *
 * The custom slot is a text pill reading "Custom" until a colour is picked,
 * then a dot like the others — the dashboard's "All friends" button is the
 * shape it borrows before that happens.
 */
export function appendColorSwatchRow(
	container: HTMLElement,
	opts: ColorSwatchRowOptions
): ColorSwatchRowHandle {
	// The raw hand-pick — "" means "use the default" (see `shown()` below).
	let picked = opts.initial;
	const shown = () => picked || opts.resetTo || opts.palette[0];

	const row = container.createDiv({ cls: "group-color-swatches" });
	const swatches = new Map<string, HTMLElement>();

	const paintFixed = () => {
		const color = shown();
		swatches.forEach((el, id) => el.toggleClass("selected", id === color));
	};

	const selectFixed = (c: string) => {
		picked = c;
		paintFixed();
		paintCustom();
		opts.onChange(picked);
	};

	for (const c of opts.palette) {
		const swatch = row.createEl("button", {
			cls: "group-color-swatch",
			attr: { "aria-label": c, type: "button" },
		});
		swatch.style.backgroundColor = c;
		swatch.addEventListener("click", () => selectFixed(c));
		swatches.set(c, swatch);
	}

	const customButton = row.createEl("button", { attr: { type: "button" } });
	function paintCustom() {
		const color = shown();
		const isCustom = !opts.palette.includes(color);
		customButton.toggleClass("group-color-custom-button", !isCustom);
		customButton.toggleClass("group-color-swatch", isCustom);
		customButton.toggleClass("selected", isCustom);
		customButton.setAttr(
			"aria-label",
			isCustom ? `Custom color ${color}` : "Choose a custom color"
		);
		customButton.setText(isCustom ? "" : "Custom");
		customButton.style.backgroundColor = isCustom ? color : "";
	}
	paintFixed();
	paintCustom();
	customButton.addEventListener("click", () => {
		const color = shown();
		openColorPopover(customButton, {
			value: opts.palette.includes(color) ? "" : color,
			fallback: opts.customFallback,
			withHex: true,
			onReset:
				opts.resetTo !== undefined
					? () => {
							picked = "";
							paintFixed();
							paintCustom();
							opts.onChange(picked);
					  }
					: undefined,
			onChange: (value) => {
				picked = value;
				paintFixed();
				paintCustom();
				opts.onChange(picked);
			},
		});
	});

	return { getColor: () => picked };
}
