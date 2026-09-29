import type { PlanSimpleItem } from "@/types";
import { formatDate } from "@/utils/dateFormat";
import {
	formatItemCost,
	formatStayHours,
	nightsLabel,
} from "@/utils/planFormat";
import { localDateOfIso } from "@/utils/dates";

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
	for (const { stay } of staysInOrder(stays)) {
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
			// The same form every share text writes a cost in.
			detailLine(formatItemCost(stay.cost));
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
 * "Friday+Saturday night (2 nights)" — the nights you're actually there.
 *
 * Named by the nights slept rather than check-in to check-out, because
 * that's the question a stay answers: three nights from Friday is Friday,
 * Saturday and Sunday, not "Friday to Monday". Two get a `+` because
 * listing both is shorter than any range of them; three or more get a dash.
 *
 * No calendar dates, even for a long stay where the same weekday comes
 * round twice — the count in brackets already says which "Friday-Friday"
 * this is.
 *
 * A stay with no check-in date falls back to its length; one with neither
 * has nothing to say.
 */
function stayDates(stay: PlanSimpleItem): string {
	const nights = stay.nights ?? 0;
	const start = localDateOfIso(stay.date);
	if (!start || nights < 1) {
		return nights > 0 ? nightsLabel(nights) : "";
	}
	const weekday = (offset: number) => {
		const day = new Date(start);
		day.setDate(day.getDate() + offset);
		return formatDate(day, { weekday: "long" });
	};
	// The last night is the one before checkout, so it's nights - 1 on.
	const first = weekday(0);
	const last = weekday(nights - 1);
	const span =
		nights === 1
			? first
			: nights === 2
			  ? `${first}+${last}`
			  : `${first}-${last}`;
	return `${span} night (${nightsLabel(nights)})`;
}

/**
 * Earliest check-in first, and stays with no date at the end.
 *
 * Storage order is whatever they were added in, which for a list read as an
 * itinerary is no order at all. Undated ones trail rather than lead: they're
 * the ones still being decided, and putting a maybe at the top of where
 * you're staying reads as the plan.
 *
 * Each stay keeps the index it has in the stored array, because that index
 * is what an edit or a delete writes back through — the same reason
 * partitionExpenses carries its own. Sorting a list of bare items and using
 * the display position would edit the wrong stay.
 *
 * The sort is stable, so two stays checking in the same day stay in the
 * order they were added rather than swapping about between renders.
 */
export function staysInOrder(
	stays: readonly PlanSimpleItem[]
): Array<{ stay: PlanSimpleItem; index: number }> {
	return stays
		.map((stay, index) => ({ stay, index }))
		.sort((a, b) => {
			const left = a.stay.date;
			const right = b.stay.date;
			if (!left && !right) return 0;
			if (!left) return 1;
			if (!right) return -1;
			return left.localeCompare(right);
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
