import { createSuite } from "./harness.mjs";
import { parseColor, relativeLuminance, needsDarkText, normalizeHex, toHex } from "./.build/callander.mjs";

/** Picking readable text for a calendar chip's own background. */
export function run() {
	const { eq, ok, result } = createSuite("contrast color");

	eq("rgb() is parsed", parseColor("rgb(90, 156, 248)"), { r: 90, g: 156, b: 248 });
	eq("rgba() drops the alpha", parseColor("rgba(90, 156, 248, 0.5)"), { r: 90, g: 156, b: 248 });
	eq("6-digit hex", parseColor("#5a9cf8"), { r: 90, g: 156, b: 248 });
	eq("3-digit hex", parseColor("#fff"), { r: 255, g: 255, b: 255 });
	eq("nonsense isn't a colour", parseColor("var(--interactive-accent)"), null);

	eq("black has no luminance", relativeLuminance({ r: 0, g: 0, b: 0 }), 0);
	eq("white has full luminance", relativeLuminance({ r: 255, g: 255, b: 255 }), 1);

	eq("white background gets dark text", needsDarkText("#ffffff"), true);
	eq("black background gets light text", needsDarkText("rgb(0, 0, 0)"), false);
	ok("a light colour (movie yellow) gets dark text", needsDarkText("rgb(220, 194, 46)"));
	eq("hex and its rgb() equivalent agree", needsDarkText("#dcc22e"), needsDarkText("rgb(220, 194, 46)"));
	eq("an unreadable colour defaults to light text", needsDarkText("var(--interactive-accent)"), false);

	eq("a full hex is kept, lowercased", normalizeHex("#AABBCC"), "#aabbcc");
	eq("the # is optional", normalizeHex("aabbcc"), "#aabbcc");
	eq("a short hex is expanded", normalizeHex("#abc"), "#aabbcc");
	eq("space around it is fine", normalizeHex("  #abc "), "#aabbcc");
	eq("anything else isn't a hex", normalizeHex("#abcd"), null);
	eq("…nor is a word", normalizeHex("purple"), null);
	eq("a colour back to hex, padded", toHex({ r: 10, g: 0, b: 255 }), "#0a00ff");

	return result();
}
