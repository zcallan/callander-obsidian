import type { TFile } from "obsidian";
import type { EventType } from "@/constants";
import type { EventStatus, EventVariant } from "@/services/EventOperations";

/**
 * Something on the calendar, past or future: a meetup, a booking, a life
 * event, a person-less task. One markdown note per event in an Events/
 * folder; linked people's timelines derive from the `people` wikilinks.
 */
export interface EventInfo {
	file: TFile;
	name: string;
	/**
	 * Flex date ("2026-05-12" | "2026-05" | "2026"), or "" for undated —
	 * **as it reads in the viewer's zone**. Identical to `sourceDate`
	 * unless the event carries a `timezone`, in which case converting the
	 * time can also move the day. This is the date to render, group, sort
	 * and filter by; see `sourceDate` for the one to write back.
	 */
	date: string;
	/** 24-hour "HH:MM", one of EVENT_SPECIAL_TIMES, or "" — resolved into
	 * the viewer's zone, the same way `date` is. */
	time: string;
	/**
	 * The zone the stored time belongs to, as an IANA id, or "" for a
	 * floating time (the default, and every event predating this).
	 */
	timezone: string;
	/**
	 * Exactly what the file says, before any zone conversion.
	 *
	 * Anything written back to the vault uses these — an edit, a copy, a
	 * generated list's ordering — because writing the converted values
	 * would rewrite the event to mean something else, differently
	 * depending on where you happened to be sitting.
	 */
	sourceDate: string;
	sourceTime: string;
	/** How long it runs, canonical "2h 30m", or "" — used by the calendar
	 * export to work out an end time. */
	duration: string;
	/** Merged event/reminder vocabulary; "" renders neutral */
	type: EventType | "";
	/** Wikilinks to people/groups whose timelines this event shows on */
	people: string[];
	location: string;
	link: string;
	/** Shown under the name on timelines */
	description: string;
	/**
	 * open | done | cancelled. Done is only offered for tasks and undated
	 * events (a dated event is implicitly done once its date passes);
	 * cancelled is the record of something that isn't happening after all —
	 * kept rather than deleted, so the history stays honest.
	 */
	status: EventStatus;
	/** Calendar entry vs a record of someone — decides whether it shows
	 * on the dashboard and the Events page. See EventVariant. */
	variant: EventVariant;
	/** Whether the people on it see it on their own timelines. True unless
	 * the note explicitly opts out, so events predating the flag behave as
	 * they always did. */
	showOnTimelines: boolean;
	/** Path of the diary entry this event was logged from, if any —
	 * used to update instead of duplicate when re-logging */
	source: string;
	created: string;
	updated: string;
	/** Added by Claude rather than typed by hand — see utils/generated */
	generated?: boolean;
	/** Free-form labels for finding a batch of events together — e.g. a
	 * season of games imported at once. */
	categories: string[];
	/** A colour picked for this one event on the calendars, "#rrggbb", or
	 * "" to follow its type (or "Color by group"). */
	color: string;
}

/**
 * LEGACY: the embedded shape events had when they lived inside a person's
 * frontmatter. Only the migration (and the plan-timeline rows, which fake
 * this shape) still read it.
 */
export interface FriendEvent {
	date: string;
	text: string;
	/** Optional details, shown under the name on the timeline */
	description?: string;
	/** Optional — legacy/untyped events are fine and render neutral */
	type?: EventType;
	/** Optional where it happened, shown after the text on the timeline */
	location?: string;
	/** Optional external URL (opened from the edit modal, not shown inline) */
	link?: string;
	/** Path of the diary entry this event was logged from, if any —
	 * used to update instead of duplicate when re-logging */
	source?: string;
	/**
	 * Wikilink to the Plan this row came from ("[[Weekend in Maine]]").
	 *
	 * Only ever set on rows *derived* at render time from a plan's
	 * membership — never written to a person's note. The plan stays the
	 * single source of truth, so a row appears and disappears with the
	 * membership itself. Its presence marks a row as read-only here.
	 */
	plan?: string;
	/** Hidden from the dashboard's Upcoming section only — the timeline
	 * on the person's page still shows it */
	hiddenFromUpcoming?: boolean;
}
