import { EVENT_TYPES } from "@/constants";
import { parseFlexDate, formatFlexDate, formatShortWeekdayDate } from "@/utils/flexdate";
import { splitLeadingEmoji } from "@/utils/emoji";
import { formatEventTime } from "@/utils/eventRow";
import { normalizeUrl } from "@/utils/url";

/**
 * An event as a plain-text message you can paste into a text — kept pure
 * (and out of the view) so it can be exercised directly, the same
 * reasoning as buildPlanShareText.
 *
 * Deliberately narrower than the note itself: no people, no type label
 * as its own line (the emoji already carries it) — a "who's coming"
 * message reads like an invitation, and that's a different message than
 * this one.
 */
export interface ShareableEvent {
	name: string;
	/** EventType id, or "" when untyped. */
	type: string;
	date: string;
	time: string;
	location: string;
	description: string;
	link: string;
}

export function buildEventShareText(e: ShareableEvent): string {
	// Same rule as the view modal's own title: the type's emoji leads
	// unless the name already brings one.
	const type = EVENT_TYPES.find((t) => t.id === e.type);
	const title =
		type && !splitLeadingEmoji(e.name) ? `${type.emoji} ${e.name}` : e.name;
	const lines: string[] = [title];

	const flex = parseFlexDate(e.date);
	const dateText = flex
		? flex.year !== null && flex.month !== null && flex.day !== null
			? formatShortWeekdayDate(new Date(flex.year, flex.month - 1, flex.day))
			: formatFlexDate(flex)
		: "";
	const timeText = e.time ? formatEventTime(e.time) : "";
	const when = [dateText, timeText].filter(Boolean).join(" • ");
	// "at Location" only reads naturally once something precedes it — with
	// no date or time, the location stands on its own instead.
	const line2 = when
		? [when, e.location && `at ${e.location}`].filter(Boolean).join(" ")
		: e.location;
	if (line2) lines.push(line2);

	if (e.description) lines.push(e.description);
	if (e.link) lines.push(normalizeUrl(e.link));

	return lines.join("\n");
}
