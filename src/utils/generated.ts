import { fieldOf } from "@/utils/fm";

/**
 * Provenance for anything an assistant (Claude, via Claudian) added to the
 * vault, as opposed to something typed by hand.
 *
 * The stored flag is the contract; the badge is presentation. Changing or
 * removing the badge touches nothing on disk, and the flag stays until
 * someone deletes it — editing an entry doesn't clear it.
 *
 * On disk it mirrors how `resurface` is already spelled in each format: a
 * `generated: true` key on frontmatter entries and on whole notes (events,
 * somedays), and a trailing 🤖 on idea task lines in the body, beside ⏳.
 */
export const GENERATED_KEY = "generated";
export const GENERATED_MARKER = "🤖";

/** What the badge says. Set to "" to hide the badge everywhere. */
export const GENERATED_LABEL = "Generated";
/** Hover text on the badge. */
export const GENERATED_TITLE = "Added by Claude";

/** YAML's boolean, or a hand-typed `"true"`. */
export function isGenerated(value: unknown): boolean {
	return (
		value === true ||
		(typeof value === "string" && value.trim().toLowerCase() === "true")
	);
}

/**
 * The flag, ready to spread onto an entry rebuilt from raw YAML. Present
 * only when set, so a hand-typed entry round-trips byte-for-byte.
 */
export function generatedField(raw: unknown): { generated?: true } {
	return isGenerated(fieldOf(raw, GENERATED_KEY)) ? { generated: true } : {};
}
