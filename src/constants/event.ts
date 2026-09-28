// Fixed event types — deliberately few; "hangout" is the broad default.
// No call/text granularity: that's the road to contact-frequency logging.
// One vocabulary for everything on a timeline or the dashboard — the old
// reminder types (outings you're going to) folded into the event types
// (things that happened). "Task" is the odd one out: not really an event,
// but a person-less "renew passport" needs somewhere to live too.
export const EVENT_TYPES = [
	{ id: "hangout", label: "Hangout", emoji: "🤝", color: "#5a9cf8" },
	{ id: "party", label: "Party", emoji: "🎉", color: "#e0559a" },
	{ id: "concert", label: "Concert", emoji: "🎸", color: "#d95757" },
	{ id: "movie", label: "Movie", emoji: "🍿", color: "#dcc22e" },
	{ id: "comedy", label: "Comedy", emoji: "🎭", color: "#45b8ac" },
	{ id: "activity", label: "Activity", emoji: "🥾", color: "#7aa64a" },
	{ id: "sports", label: "Sports", emoji: "🏀", color: "#e2703a" },
	{ id: "event", label: "Event", emoji: "📅", color: "#8f9aa5" },
	{ id: "trip", label: "Trip", emoji: "✈️", color: "#45b8ac" },
	{ id: "milestone", label: "Milestone", emoji: "🏅", color: "#dcc22e" },
	{ id: "life", label: "Life event", emoji: "🌱", color: "#5cb870" },
	{ id: "given", label: "Given", emoji: "🎁", color: "#e69735" },
	{ id: "task", label: "Task", emoji: "⏰", color: "#e5342b" },
	{ id: "other", label: "Other", emoji: "✨", color: "#9a7ef0" },
] as const;

export type EventType = (typeof EVENT_TYPES)[number]["id"];

/**
 * The colour that stands for an event type — the timeline dot, the calendar
 * chip's edge. Falls back to the neutral border colour for an untyped event,
 * which is what an uncoloured dot has always rendered as.
 */
export function eventColour(type: string): string {
	return (
		EVENT_TYPES.find((t) => t.id === type)?.color ??
		"var(--background-modifier-border)"
	);
}

// The retired reminders store/folder names — only the migration reads these
export const REMINDERS_BASENAME = "Reminders";
