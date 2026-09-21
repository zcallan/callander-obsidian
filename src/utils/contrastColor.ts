/**
 * Choosing readable text for a background colour that isn't known until
 * render time — an event's own colour, a category's generated one, a
 * plan's accent, whatever a theme resolves `var(--interactive-accent)` to.
 *
 * Follows the standard approach: relative luminance (WCAG's own formula),
 * then whichever of black or white has the higher contrast ratio against
 * it. That's the same rule browsers' own accessibility tooling uses, so it
 * generalises to a colour nobody previewed rather than guessing from a
 * handful of cases.
 */

/** A CSS colour as resolved by `getComputedStyle` ("rgb(r, g, b)",
 * "rgba(r, g, b, a)") or a hex string ("#5a9cf8", "#fff"). Null if it's
 * neither — a `var()` that failed to resolve, for instance. */
export function parseColor(css: string): { r: number; g: number; b: number } | null {
	const text = css.trim();
	const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(text);
	if (rgb) {
		return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
	}
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
	if (hex) {
		const full =
			hex[1].length === 3
				? hex[1]
						.split("")
						.map((c) => c + c)
						.join("")
				: hex[1];
		const num = parseInt(full, 16);
		return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
	}
	return null;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance({
	r,
	g,
	b,
}: {
	r: number;
	g: number;
	b: number;
}): number {
	const channel = (v: number) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two luminances, 1 (none) to 21 (max). */
function contrastRatio(a: number, b: number): number {
	const [hi, lo] = a > b ? [a, b] : [b, a];
	return (hi + 0.05) / (lo + 0.05);
}

/**
 * True when black text reads better than white against this background;
 * false for white, or when the colour couldn't be read at all — every
 * colour a chip carries here is mid-to-dark, so light text is the safer
 * default for something unreadable rather than a guess either way.
 */
export function needsDarkText(background: string): boolean {
	const rgb = parseColor(background);
	if (!rgb) return false;
	const l = relativeLuminance(rgb);
	return contrastRatio(l, 0) >= contrastRatio(l, 1);
}

/** What someone typed in a hex field — "#abc", "abc", "#AABBCC" — as the
 * "#aabbcc" a picker and the settings store; null if it isn't one. */
export function normalizeHex(raw: string): string | null {
	const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw.trim());
	if (!m) return null;
	const digits =
		m[1].length === 3
			? m[1]
					.split("")
					.map((c) => c + c)
					.join("")
			: m[1];
	return `#${digits.toLowerCase()}`;
}

/** A parsed colour as "#rrggbb". */
export function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
	return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
