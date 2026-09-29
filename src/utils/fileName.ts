/**
 * File names built from what people type. The rules here are persisted:
 * a vault's existing files carry them, and updateEvent renames any event
 * whose name has drifted from its slug, so change them only on purpose.
 */

import { nameWithoutLeadingEmoji } from "@/utils/emoji";

/** What a file name can't hold here: the OS's reserved set plus link syntax. */
export const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|#^[\]]/g;

/** `name` with illegal characters swapped for "-" and trimmed; `fallback` if that leaves nothing. */
export function safeFileName(name: string, fallback = ""): string {
	return name.replace(ILLEGAL_FILENAME_CHARS, "-").trim() || fallback;
}

/**
 * Why a group name can't be used, or null when it can. A group's page is
 * found by its name, and its wikilink is the name, so a character a file
 * name or a link can't hold is refused rather than swapped out.
 */
export function groupNameProblem(name: string): string | null {
	if (!name.trim()) return "A group needs a name";
	if (new RegExp(ILLEGAL_FILENAME_CHARS.source).test(name)) {
		return 'Group names can\'t contain \\ / : * ? " < > | # ^ [ or ]';
	}
	return null;
}

/** How much of an event's name its slug keeps, in UTF-16 units. */
export const EVENT_SLUG_NAME_MAX = 60;

/**
 * An event's file name — "2026-08-06 Austin • Concert" — from the date, up
 * to two people, and the event name. Frontmatter `name` stays the event's
 * only real name (emoji and all); the slug just makes the quick switcher
 * and file explorer readable, so a leading emoji is dropped there rather
 * than repeated in the filename. Three or more people would sprawl, so
 * they stay out of the slug entirely.
 *
 * `personName` reads one stored person link as the text the slug shows.
 */
export function eventSlug(
	fields: { name: string; date?: string; people?: string[] },
	personName: (link: string) => string
): string {
	const name =
		safeFileName(nameWithoutLeadingEmoji(fields.name))
			.slice(0, EVENT_SLUG_NAME_MAX)
			.trim() || "Event";
	const people = (fields.people ?? []).map((p) => safeFileName(personName(p)));
	const who =
		people.length >= 1 && people.length <= 2 ? people.join(" & ") : "";
	const date = (fields.date ?? "").trim();
	const prefix = [date, who].filter(Boolean).join(" ");
	if (!prefix) return name;
	// People get a "•" so the slug reads "who • what"; a bare date runs
	// straight into the name.
	return who ? `${prefix} • ${name}` : `${prefix} ${name}`;
}
