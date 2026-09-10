import type { PlanSimpleItem } from "@/types";
import { BOOKING_STATES } from "@/constants";
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
	address: boolean;
	notes: boolean;
	people: boolean;
	costs: boolean;
	/** "Need to book" — a stay's one outstanding action. */
	booking: boolean;
}

export const STAY_SHARE_FIELDS: {
	id: keyof StayShareDetail;
	label: string;
}[] = [
	{ id: "address", label: "Address" },
	{ id: "notes", label: "Notes" },
	{ id: "people", label: "People" },
	{ id: "costs", label: "Costs" },
	{ id: "booking", label: "Booking" },
];

/**
 * Address and notes lead, because they're what somebody arriving actually
 * needs; the cost and who's on the booking are yours to know and go on
 * deliberately. Booking status stays on — an unbooked stay is the one thing
 * in this list that still needs doing.
 */
export const STAY_SHARE_DEFAULTS: StayShareDetail = {
	address: true,
	notes: true,
	people: false,
	costs: false,
	booking: true,
};

export function buildStayShareText(
	stays: readonly PlanSimpleItem[],
	detail: StayShareDetail
): string {
	const blocks: string[][] = [];
	for (const stay of stays) {
		const lines = [heading(stay)];
		// Indented, so a stay's details read as belonging to the name above
		// rather than as more stays.
		const detailLine = (text: string) => lines.push(`  ${text}`);

		// Always, when recorded: check-in hours are the half of "where" that
		// decides when you can actually turn up. No toggle, for the same
		// reason the nights have none.
		const hours = formatStayHours(stay.checkIn, stay.checkOut);
		if (hours) detailLine(hours);

		if (detail.address && stay.address) detailLine(stay.address);
		if (detail.people && stay.people) detailLine(stay.people);
		if (detail.costs && typeof stay.cost === "number") {
			detailLine(formatMoney(stay.cost));
		}
		if (detail.booking) {
			const label = bookingLabel(stay);
			if (label) detailLine(label);
		}
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
 * "The Notch House: 2 nights".
 *
 * Nights only. The hours go on their own line below — formatStayHours
 * returns a phrase ("Check in 4pm, 10am out") rather than a range, which is
 * a sentence's worth of heading.
 */
function heading(stay: PlanSimpleItem): string {
	return stay.nights
		? `${stay.text}: ${nightsLabel(stay.nights)}`
		: stay.text;
}

/**
 * What's left to do about the booking, or nothing.
 *
 * "Need to book" rather than BOOKING_STATES' own "To book" — the same
 * wording the row on screen uses, since stated on a line of its own the
 * shorter label reads like a category instead of a prompt. A stay that
 * needs no booking says nothing at all.
 */
function bookingLabel(stay: PlanSimpleItem): string {
	if (stay.booked === "todo") return "Need to book";
	if (stay.booked === "booked") {
		return BOOKING_STATES.find((b) => b.id === "booked")?.label ?? "Booked";
	}
	return "";
}
