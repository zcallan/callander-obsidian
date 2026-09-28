// Where you're sleeping — deliberately few; untyped stays render the bed.
export const ACCOMMODATION_TYPES = [
	{ id: "home", label: "Home", emoji: "🏠" },
	{ id: "airbnb", label: "Airbnb", emoji: "🏡" },
	{ id: "hotel", label: "Hotel", emoji: "🏨" },
	{ id: "hostel", label: "Hostel", emoji: "🎒" },
	{ id: "camping", label: "Camping", emoji: "⛺" },
	{ id: "other", label: "Other", emoji: "🛏️" },
] as const;

export type AccommodationType = (typeof ACCOMMODATION_TYPES)[number]["id"];

export const ACCOMMODATION_EMOJI: Record<AccommodationType, string> = {
	home: "🏠",
	airbnb: "🏡",
	hotel: "🏨",
	hostel: "🎒",
	camping: "⛺",
	// The generic bed the timeline already falls back to for an untyped stay.
	other: "🛏️",
};

/**
 * A stay's check-in/check-out when the hour genuinely doesn't matter —
 * distinct from unset, which means nobody has said yet. Stored rather than
 * blank so "we can arrive whenever" and "we haven't checked" don't collapse
 * into the same answer.
 */
export const ANY_TIME = "any";

// Booking status for stays; "none" (no booking needed) shows nothing.
export const BOOKING_STATES = [
	{ id: "booked", label: "Booked", emoji: "✅" },
	{ id: "todo", label: "To book", emoji: "📌" },
	{ id: "none", label: "Not needed", emoji: "➖" },
] as const;

export type BookingState = (typeof BOOKING_STATES)[number]["id"];

// Plan ideas carry a category and a priority — a plan is a menu.
export const PLAN_IDEA_CATEGORIES = [
	{ id: "activity", label: "Activity", emoji: "🥾" },
	{ id: "restaurant", label: "Restaurant", emoji: "🍕" },
	{ id: "bar", label: "Bar", emoji: "🍺" },
	{ id: "coffee", label: "Coffee", emoji: "☕" },
	{ id: "cooking", label: "Cooking", emoji: "🍳" },
	{ id: "sightseeing", label: "Sightseeing", emoji: "📸" },
	{ id: "show", label: "Show", emoji: "🎭" },
	{ id: "event", label: "Event", emoji: "🏀" },
	{ id: "meetup", label: "Meetup", emoji: "👋" },
	{ id: "task", label: "Task", emoji: "⏰" },
	{ id: "shopping", label: "Shopping", emoji: "🛍️" },
	{ id: "other", label: "Other", emoji: "✨" },
] as const;

export type PlanIdeaCategory = (typeof PLAN_IDEA_CATEGORIES)[number]["id"];

export const PLAN_PRIORITIES = [
	{ id: "must", label: "Must-do", emoji: "🎯" },
	{ id: "maybe", label: "Maybe", emoji: "🤔" },
] as const;

export type PlanPriority = (typeof PLAN_PRIORITIES)[number]["id"];

// How you're getting there — shown as an icon beside travel legs.
export const TRAVEL_TYPES = [
	{ id: "car", label: "Driving", emoji: "🚗" },
	{ id: "plane", label: "Flying", emoji: "✈️" },
	{ id: "bus", label: "Bus", emoji: "🚌" },
	{ id: "train", label: "Train", emoji: "🚆" },
	{ id: "boat", label: "Boat", emoji: "⛵" },
	{ id: "taxi", label: "Taxi", emoji: "🚕" },
	{ id: "bike", label: "Bike", emoji: "🚲" },
	{ id: "walking", label: "Walking", emoji: "🚶" },
	{ id: "running", label: "Running", emoji: "🏃" },
	{ id: "other", label: "Other", emoji: "🧭" },
] as const;

export type TravelType = (typeof TRAVEL_TYPES)[number]["id"];

export const TRAVEL_TYPE_EMOJI: Record<TravelType, string> =
	Object.fromEntries(TRAVEL_TYPES.map((t) => [t.id, t.emoji])) as Record<
		TravelType,
		string
	>;
