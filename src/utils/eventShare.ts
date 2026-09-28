import { EVENT_TYPES } from "@/constants";
import { parseFlexDate, formatFlexDate, formatShortWeekdayDate } from "@/utils/flexdate";
import { splitLeadingEmoji } from "@/utils/emoji";
import { formatEventTime } from "@/utils/eventRow";
import { zonedWallTimeToInstant } from "@/utils/timezone";
import { normalizeUrl } from "@/utils/url";
import { parseDurationMinutes } from "@/utils/planFormat";
import { pad2 } from "@/utils/dates";

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
	/** Canonical "2h 30m", or "" — only the calendar link reads it; the
	 * share text deliberately leaves it out, since how long something runs
	 * isn't what an invitation message is for. */
	duration?: string;
	location: string;
	description: string;
	link: string;
	/** Set when the time belongs to a specific zone — see EventInfo. Lets
	 * the calendar link name a real moment rather than a wall clock. */
	timezone?: string;
	sourceDate?: string;
	sourceTime?: string;
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
	const timeText = e.time ? formatEventTime(e.time, { long: true }) : "";
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

/**
 * "Add to calendar" — Google Calendar's own prefilled-event link, opened in
 * the browser rather than handed off as a file. One tap lands on Google's
 * "Save event" screen with everything already filled in; there's no import
 * step, and no dependence on how a given OS or browser happens to route an
 * `.ics` file today.
 *
 * Null when the date isn't day-precision: a month- or year-only date has no
 * single day to put on a calendar, so there's nowhere sensible to send
 * someone.
 */
export function buildGoogleCalendarUrl(
	e: ShareableEvent,
	/**
	 * Who's on it, already resolved to display names and shortened — the
	 * same list the view modal shows. Appended to the title as "with A, B",
	 * because a calendar entry read months later rarely says who it was
	 * with, and that's usually the thing you want to remember.
	 *
	 * A separate argument rather than a field on ShareableEvent: that shape
	 * deliberately carries no people (see its own note), since the share
	 * text reads as an invitation and naming its recipients back to them
	 * would be odd. Only the calendar title wants them.
	 */
	people: string[] = []
): string | null {
	const flex = parseFlexDate(e.date);
	if (
		!flex ||
		flex.year === null ||
		flex.month === null ||
		flex.day === null
	) {
		return null;
	}
	const { year, month, day } = flex;
	const stamp = (d: Date) =>
		`${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;

	let dates: string;
	const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(e.time);
	if (timeMatch) {
		const hour = Number(timeMatch[1]);
		const minute = Number(timeMatch[2]);
		// Its own duration when it has one, else an hour — the same default
		// Google Calendar itself fills in for an event created by hand.
		const minutes = parseDurationMinutes(e.duration) ?? 60;
		const end = new Date(
			new Date(year, month - 1, day, hour, minute).getTime() +
				minutes * 60000
		);
		const startStamp = `${stamp(
			new Date(year, month - 1, day)
		)}T${pad2(hour)}${pad2(minute)}00`;
		const endStamp = `${stamp(end)}T${pad2(end.getHours())}${pad2(
			end.getMinutes()
		)}00`;
		// An event that names a zone names a real moment, so the link says
		// so in UTC and lands correctly for whoever opens it, wherever they
		// are. Without one the time is floating and stays floating (no
		// "Z"): it was written down as a wall clock, and Google renders it
		// in the opener's own local time, which is the assumption the rest
		// of this plugin already makes about a bare "HH:MM".
		const instant =
			e.timezone && e.sourceDate && e.sourceTime
				? zonedWallTimeToInstant(e.sourceDate, e.sourceTime, e.timezone)
				: null;
		if (instant) {
			const utc = (d: Date) =>
				`${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(
					d.getUTCDate()
				)}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}00Z`;
			dates = `${utc(instant)}/${utc(
				new Date(instant.getTime() + minutes * 60000)
			)}`;
		} else {
			dates = `${startStamp}/${endStamp}`;
		}
	} else {
		// All-day: Google's end date is exclusive, so a single day needs the
		// day after as its end. `day + 1` overflowing into next month is
		// exactly what the Date constructor normalises on its own.
		const end = new Date(year, month - 1, day + 1);
		dates = `${stamp(new Date(year, month - 1, day))}/${stamp(end)}`;
	}

	const type = EVENT_TYPES.find((t) => t.id === e.type);
	const named =
		type && !splitLeadingEmoji(e.name) ? `${type.emoji} ${e.name}` : e.name;
	const withWhom = people.filter(Boolean);
	const title =
		withWhom.length > 0 ? `${named} with ${withWhom.join(", ")}` : named;

	const params = [
		"action=TEMPLATE",
		`text=${encodeURIComponent(title)}`,
		`dates=${dates}`,
		e.description && `details=${encodeURIComponent(e.description)}`,
		e.location && `location=${encodeURIComponent(e.location)}`,
	].filter(Boolean);

	return `https://calendar.google.com/calendar/render?${params.join("&")}`;
}
