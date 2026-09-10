import type { PlanSimpleItem } from "@/types";
import { formatDate } from "@/utils/dateFormat";
import { formatMoney } from "@/utils/expenseMath";
import { formatStayHours, nightsLabel } from "@/utils/planFormat";

/**
 * Where you're staying, as plain text.
 *
 * The same four details the timeline's share offers for a stay — address,
 * notes, people, cost — plus what's still to book, which is the one thing a
 * stay carries that the timeline states elsewhere.
 *
 * Kept pure and out of the section so it can be exercised directly, and read
 * off the stored item rather than off the rendered row, so a copy can't
 * inherit a display quirk.
 */

export interface StayShareDetail {
	/** "Thursday to Sunday (2 nights)". */
	dates: boolean;
	address: boolean;
	notes: boolean;
	people: boolean;
	costs: boolean;
}

export const STAY_SHARE_FIELDS: {
	id: keyof StayShareDetail;
	label: string;
}[] = [
	{ id: "dates", label: "Dates" },
	{ id: "address", label: "Address" },
	{ id: "notes", label: "Notes" },
	{ id: "people", label: "People" },
	{ id: "costs", label: "Costs" },
];

/**
 * Dates, address and notes lead, because they're what somebody turning up
 * actually needs; the cost and who's on the booking are yours to know and
 * go on deliberately.
 */
export const STAY_SHARE_DEFAULTS: StayShareDetail = {
	dates: true,
	address: true,
	notes: true,
	people: false,
	costs: false,
};

export function buildStayShareText(
	stays: readonly PlanSimpleItem[],
	detail: StayShareDetail
): string {
	const blocks: string[][] = [];
	for (const stay of inCheckInOrder(stays)) {
		const lines = [heading(stay, detail)];
		// Indented, so a stay's details read as belonging to the name above
		// rather than as more stays.
		const detailLine = (text: string) => lines.push(`  ${text}`);

		// Above the hours: which days, then what time on them.
		if (detail.dates) {
			const span = stayDates(stay);
			if (span) detailLine(span);
		}

		// Always, when recorded: check-in hours are the half of "where" that
		// decides when you can actually turn up.
		const hours = formatStayHours(stay.checkIn, stay.checkOut);
		if (hours) detailLine(hours);

		if (detail.address && stay.address) detailLine(stay.address);
		if (detail.people && stay.people) detailLine(stay.people);
		if (detail.costs && typeof stay.cost === "number") {
			detailLine(formatMoney(stay.cost));
		}
		// No toggle: an unbooked stay is the one line here that still needs
		// doing, and a message about where you're staying that quietly omits
		// "nobody has booked this" is the wrong message.
		const booking = bookingLabel(stay);
		if (booking) detailLine(booking);
		// Last, because it's the longest and the least uniform — a door code
		// and a paragraph both live here.
		if (detail.notes && stay.notes) detailLine(stay.notes);
		blocks.push(lines);
	}
	// A blank line between stays: each is a block of its own details, and
	// run together they read as one long list of lines.
	return blocks.map((lines) => lines.join("\n")).join("\n\n");
}

/**
 * Just the name, once the dates line is carrying the nights.
 *
 * With Dates off it takes them back rather than dropping them — turning a
 * line off should lose the days, not how long you're there.
 */
function heading(stay: PlanSimpleItem, detail: StayShareDetail): string {
	const nightsShown = detail.dates && !!stayDates(stay);
	return stay.nights && !nightsShown
		? `${stay.text}: ${nightsLabel(stay.nights)}`
		: stay.text;
}

/**
 * "Thursday to Sunday (2 nights)" — which days the stay covers.
 *
 * Weekday names alone read best and are how anybody says it out loud, but
 * they stop being unique past a week, so a longer stay gets the dates too.
 * A stay with no check-in date falls back to its length; one with neither
 * has nothing to say and returns null.
 */
function stayDates(stay: PlanSimpleItem): string {
	const nights = stay.nights ?? 0;
	const start = stay.date ? new Date(`${stay.date}T00:00:00`) : null;
	if (!start || isNaN(start.getTime()) || nights < 1) {
		return nights > 0 ? nightsLabel(nights) : "";
	}
	const end = new Date(start);
	end.setDate(end.getDate() + nights);
	// Past a week the same weekday comes round again, so "Thursday to
	// Thursday" could be seven nights or fourteen.
	const long = nights > 6;
	const label = (d: Date) =>
		formatDate(
			d,
			long
				? { weekday: "long", day: "numeric", month: "long" }
				: { weekday: "long" }
		);
	return `${label(start)} to ${label(end)} (${nightsLabel(nights)})`;
}

/**
 * Earliest check-in first, and stays with no date at the end.
 *
 * Storage order is whatever they were added in, which for a list read as an
 * itinerary is no order at all. Undated ones trail rather than lead: they're
 * the ones still being decided, and putting a maybe at the top of where
 * you're staying reads as the plan.
 */
function inCheckInOrder(
	stays: readonly PlanSimpleItem[]
): PlanSimpleItem[] {
	return [...stays].sort((a, b) => {
		if (!a.date && !b.date) return 0;
		if (!a.date) return 1;
		if (!b.date) return -1;
		return a.date.localeCompare(b.date);
	});
}

/**
 * What's left to do about the booking, or nothing.
 *
 * Only the outstanding state gets a line. "Booked" tells the reader nothing
 * they need — every stay in the list is one you intend to use, so the
 * absence of a warning is the good news, and printing it on most of them
 * only buries the one that still needs doing.
 *
 * "Need to book" rather than BOOKING_STATES' own "To book" — the same
 * wording the row on screen uses, since stated on a line of its own the
 * shorter label reads like a category instead of a prompt.
 */
function bookingLabel(stay: PlanSimpleItem): string {
	return stay.booked === "todo" ? "Need to book" : "";
}
