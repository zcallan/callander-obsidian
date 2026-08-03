import type { PlanTimelineEntry } from "@/types";
import { ACCOMMODATION_EMOJI, TRAVEL_TYPE_EMOJI } from "@/constants";
import { PlanOperations } from "@/services/PlanOperations";
import { parseFlexDate, formatFlexDate } from "@/utils/flexdate";
import { formatDate } from "@/utils/dateFormat";
import {
	formatItemTime,
	formatTimelineDay,
	nightsLabel,
	nightsSummary,
	startsWithEmoji,
} from "@/utils/planFormat";

/**
 * The plan as a plain-text message you can paste to the group chat.
 *
 * Kept pure (and out of the view) so it can be exercised directly: the
 * dated part is read straight off `timelineOf`, the same derivation the
 * on-screen timeline uses, so the copy can never fall out of step with it.
 */

export interface PlanShareOptions {
	/** You're on the trip too — you lead the member list. */
	yourName: string;
	/** Member display names, already resolved from wikilinks. */
	members: string[];
	/** Invited-but-unconfirmed display names, likewise resolved. */
	unconfirmed: string[];
}

/** "Riley" — or "Riley P" when two Rileys would otherwise collide. */
export function shortenMemberNames(fullNames: string[]): string[] {
	const firstCounts = new Map<string, number>();
	for (const name of fullNames) {
		const first = name.trim().split(/\s+/)[0].toLowerCase();
		firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1);
	}
	return fullNames.map((name) => {
		const parts = name.trim().split(/\s+/);
		const first = parts[0];
		const isDupe = (firstCounts.get(first.toLowerCase()) ?? 0) > 1;
		if (isDupe && parts.length > 1) {
			return `${first} ${parts[1].charAt(0).toUpperCase()}`;
		}
		return first;
	});
}

/** "Thu 30 Jul - Sun 2 Aug", collapsing to one date when there's no range. */
export function formatPlanDateRange(
	date: unknown,
	endDate: unknown
): string {
	const asFlex = (v: unknown) =>
		typeof v === "string" || typeof v === "number" ? v : undefined;
	const start = parseFlexDate(asFlex(date));
	if (!start) return "";
	const end = parseFlexDate(asFlex(endDate));

	const exact = (d: {
		year: number | null;
		month: number | null;
		day: number | null;
	}) =>
		d.year !== null && d.month !== null && d.day !== null
			? new Date(d.year, d.month - 1, d.day)
			: null;

	const startDate = exact(start);
	const endDay = end ? exact(end) : null;
	if (!startDate) return formatFlexDate(start);

	const fmt = (d: Date) =>
		formatDate(d, {
			weekday: "short",
			day: "numeric",
			month: "short",
		});

	if (!endDay || endDay.getTime() === startDate.getTime()) {
		return fmt(startDate);
	}
	return `${fmt(startDate)} - ${fmt(endDay)}`;
}

/**
 * One timeline row as share text: when — what (meta), with a stay's address
 * and notes on their own lines, since that's exactly the detail people ask
 * for after you send the plan.
 */
export function planShareLines(entry: PlanTimelineEntry): string[] {
	const isStay = entry.source === "accommodation";
	const when = isStay
		? "Sleeping at"
		: entry.time
		? formatItemTime(entry.time)
		: "";

	// How long / who — each its own bullet, so the people never run on from
	// the timing. Names stay comma-joined inside their bullet. No wrapping
	// brackets: the stay summary brings its own, and they'd nest.
	const bits: string[] = [];
	if (entry.duration) bits.push(entry.duration);
	if (entry.nights) bits.push(nightsSummary(entry.date, entry.nights));
	if (entry.people) bits.push(entry.people);

	const icon = startsWithEmoji(entry.text) ? "" : `${entry.emoji} `;
	const meta = bits.length > 0 ? ` • ${bits.join(" • ")}` : "";
	const lines = [`- ${when ? `${when} — ` : ""}${icon}${entry.text}${meta}`];
	if (entry.address) lines.push(`  📍 ${entry.address}`);
	if (entry.notes) lines.push(`  ${entry.notes}`);
	return lines;
}

export function buildPlanShareText(
	data: Record<string, unknown>,
	opts: PlanShareOptions
): string {
	const lines: string[] = [String(data.name ?? "")];

	const range = formatPlanDateRange(data.date, data.endDate);
	if (range) lines.push(range);
	if (data.location) lines.push(String(data.location));

	// You're on the trip too — lead with your name, deduped in case you're
	// also listed as a member.
	const yourName = opts.yourName;
	const memberNames = opts.members.filter(
		(n) => !yourName || n.toLowerCase() !== yourName.toLowerCase()
	);
	const fullNames = yourName ? [yourName, ...memberNames] : memberNames;
	// Shorten across the whole pool so dupes disambiguate consistently.
	const shortened = shortenMemberNames([...fullNames, ...opts.unconfirmed]);
	const names = shortened.slice(0, fullNames.length);
	const unconfirmedNames = shortened.slice(fullNames.length);
	if (names.length > 0) {
		lines.push(`${names.join(", ")} (${names.length})`);
	}
	if (unconfirmedNames.length > 0) {
		lines.push(`Unconfirmed: ${unconfirmedNames.join(", ")}`);
	}

	// Everything dated, day by day, in timeline order.
	let currentDay = "";
	for (const entry of PlanOperations.timelineOf(data)) {
		if (entry.date !== currentDay) {
			currentDay = entry.date;
			lines.push("", formatTimelineDay(entry.date));
		}
		lines.push(...planShareLines(entry));
	}

	// Undated items still have to appear somewhere, or copying would quietly
	// drop them.
	const undatedTravel = PlanOperations.simpleListOf(data, "travel").filter(
		(t) => !t.date
	);
	if (undatedTravel.length > 0) {
		lines.push("", "Travel:");
		undatedTravel.forEach((t) => {
			const icon = t.type ? `${TRAVEL_TYPE_EMOJI[t.type]} ` : "";
			const bits = [t.duration, t.people].filter(Boolean);
			const meta = bits.length > 0 ? ` • ${bits.join(" • ")}` : "";
			lines.push(`- ${icon}${t.text}${meta}`);
		});
	}

	const undatedStay = PlanOperations.simpleListOf(
		data,
		"accommodation"
	).filter((a) => !a.date);
	if (undatedStay.length > 0) {
		lines.push("", "Staying:");
		undatedStay.forEach((a) => {
			const icon = (a.stay && ACCOMMODATION_EMOJI[a.stay]) || "🛏️";
			const meta = a.nights ? ` • ${nightsLabel(a.nights)}` : "";
			lines.push(`- ${icon} ${a.text}${meta}`);
		});
	}

	// What's left is the menu: ideas nobody has pinned to a day yet —
	// must-dos first, maybes marked.
	const undatedIdeas = PlanOperations.itemsOf(data).filter((i) => !i.date);
	if (undatedIdeas.length > 0) {
		lines.push("", "Ideas:");
		const musts = undatedIdeas.filter((i) => i.priority === "must");
		const maybes = undatedIdeas.filter((i) => i.priority !== "must");
		musts.forEach((i) => lines.push(`- ${i.text}`));
		maybes.forEach((i) => lines.push(`- ${i.text} (if there's time)`));
	}

	// Checked state stays personal — the message lists everything.
	const bring = PlanOperations.bringOf(data);
	if (bring.length > 0) {
		lines.push("", "Bring:");
		bring.forEach((b) => lines.push(`- ${b.text}`));
	}

	return lines.join("\n");
}
