import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSuite } from "./harness.mjs";

/**
 * Guards on src/styles/base.css, the one stylesheet that isn't scoped: every
 * class it styles should be one the plugin still puts on an element, and it
 * shouldn't reach into what Obsidian, themes and other plugins share.
 *
 * Today's exceptions are listed below, so these pass now and fail on
 * anything new. An exception that no longer occurs fails as well: take its
 * entry out in the commit that fixes it, so the lists only ever shrink.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Classes Obsidian puts on its own elements, which base.css styles on purpose. */
const OBSIDIAN_CLASSES = new Set([
	"cm-editor",
	"cm-scroller",
	"cm-sizer",
	"embedded-backlinks",
	"inline-title",
	"markdown-source-view",
	"metadata-container",
	"modal-content",
	"side-dock-ribbon-action",
	"svg-icon",
]);

/**
 * Classes src builds from a template, such as `timeline-dot-${source}`, so
 * they never appear whole. Any class starting with one counts as produced.
 */
const BUILT_PREFIXES = [
	"contact-notes-tool-",
	"dashboard-rel-",
	"timeline-dot-",
	"timeline-",
];

/** In src, but never as a class: a view type, which Obsidian writes to data-type. */
const NOT_A_CLASS = new Set(["callander-view"]);

// ---- Today's exceptions: each one is a fix still to make ----

/**
 * Styled, but nothing puts them on an element any more. Empty since the dead
 * rules went: a class that turns up here is a rule to delete, not an entry
 * to add.
 */
const DEAD_CLASSES = [];

/** Rules on the whole document rather than under a Callander class. */
const ROOT_RULES = [];

/**
 * Animations not named `callander-…`. Keyframes are global, so one sharing
 * a name with a theme's or another plugin's replaces it, or is replaced.
 */
const UNPREFIXED_KEYFRAMES = [];

/**
 * Selectors on Obsidian's modal classes with no `callander-` class to keep
 * them to Callander's own modals. Some reach every plugin's modals.
 */
const UNSCOPED_MODAL_SELECTORS = [
	".is-mobile .modal",
	".is-mobile .modal .contact-bday-inputs",
	".is-mobile .modal .contact-bday-inputs > *",
	".is-mobile .modal .contact-event-text-input",
	".is-mobile .modal .contact-field-input",
	".is-mobile .modal .contact-met-controls",
	".is-mobile .modal .contact-met-controls > *",
	".is-mobile .modal .contact-met-precision",
	".is-mobile .modal .expense-share-input",
	".is-mobile .modal .plan-time-precision",
	".is-mobile .modal .quick-idea-input",
	'.is-mobile .modal input[type="date"]',
	'.is-mobile .modal input[type="date"]::-webkit-date-and-time-value',
	'.is-mobile .modal input[type="month"]',
	'.is-mobile .modal input[type="month"]::-webkit-date-and-time-value',
	".is-mobile .modal-content",
	".is-phone .modal-content",
	".modal .contact-bday-inputs",
	".modal .contact-bday-inputs > *",
	".modal .contact-event-text-input",
	".modal .contact-field-input",
	".modal .contact-met-controls",
	".modal .contact-met-controls > *",
	".modal .expense-expr-row .expense-share-right",
	".modal .expense-share-input",
	".modal .expense-share-input.expense-expr-input",
	".modal .expense-share-input.is-disabled",
	".modal .quick-idea-categories",
	".modal .quick-idea-input",
	'.modal input[type="date"]',
	'.modal input[type="month"]',
	'.modal input[type="number"]',
	".modal.ft-modal-shake",
];

/** base.css without its comments, and every selector in it, one each. */
function readStylesheet() {
	const css = readFileSync(path.join(root, "src/styles/base.css"), "utf8").replace(
		/\/\*[\s\S]*?\*\//g,
		""
	);
	const KEYFRAME_STEP = /^(from|to|\d+(\.\d+)?%)(\s*,\s*(from|to|\d+(\.\d+)?%))*$/;
	const selectors = [];
	for (const match of css.matchAll(/([^{}]+)\{/g)) {
		const list = match[1].trim();
		if (!list || list.startsWith("@") || KEYFRAME_STEP.test(list)) continue;
		for (const selector of list.split(",")) {
			selectors.push(selector.replace(/\s+/g, " ").trim());
		}
	}
	return { css, selectors };
}

/** Every word in src's code, hyphens included: the classes it can produce. */
function sourceWords() {
	const files = (dir) =>
		readdirSync(dir).flatMap((name) => {
			const full = path.join(dir, name);
			if (statSync(full).isDirectory()) return files(full);
			return /\.tsx?$/.test(name) ? [full] : [];
		});
	return new Set(
		files(path.join(root, "src")).flatMap(
			(file) => readFileSync(file, "utf8").match(/[\w-]+/g) ?? []
		)
	);
}

export function run() {
	const { eq, result } = createSuite("stylesheet guards");
	const { css, selectors } = readStylesheet();

	/** Fails on an entry `found` has and `allowed` doesn't, and the reverse. */
	const ratchet = (label, found, allowed) => {
		eq(`${label}: nothing new`, [...found].filter((x) => !allowed.includes(x)).sort(), []);
		eq(
			`${label}: no entry left over from a fix`,
			allowed.filter((x) => !found.has(x)),
			[]
		);
	};

	const words = sourceWords();
	const produced = (name) =>
		OBSIDIAN_CLASSES.has(name) ||
		BUILT_PREFIXES.some((prefix) => name.startsWith(prefix)) ||
		(words.has(name) && !NOT_A_CLASS.has(name));
	const classes = new Set(
		selectors.flatMap((s) =>
			[...s.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1])
		)
	);
	ratchet(
		"classes nothing produces",
		new Set([...classes].filter((name) => !produced(name))),
		DEAD_CLASSES
	);

	eq("no !important", (css.match(/!important/g) ?? []).length, 0);

	ratchet(
		":root rules",
		new Set(selectors.filter((s) => /(^|[\s>+~]):root\b/.test(s))),
		ROOT_RULES
	);
	ratchet(
		"keyframes not named callander-…",
		new Set(
			[...css.matchAll(/@keyframes\s+([\w-]+)/g)]
				.map((m) => m[1])
				.filter((name) => !name.startsWith("callander-"))
		),
		UNPREFIXED_KEYFRAMES
	);
	ratchet(
		"modal selectors without a callander- class",
		new Set(
			selectors.filter(
				(s) =>
					/\.modal(-content|-container)?(?![\w-])/.test(s) &&
					!/\.callander-/.test(s)
			)
		),
		UNSCOPED_MODAL_SELECTORS
	);

	return result();
}
