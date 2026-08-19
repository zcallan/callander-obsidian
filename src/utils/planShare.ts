import type { PlanTimelineEntry } from "@/types";
import { ACCOMMODATION_EMOJI, TRAVEL_TYPE_EMOJI } from "@/constants";
import { PlanOperations } from "@/services/PlanOperations";
import {
	parseFlexDate,
	formatFlexDate,
	formatShortWeekdayDate,
} from "@/utils/flexdate";
import { toText } from "@/utils/fm";
import {
	formatItemCost,
	formatItemTime,
	parseDurationMinutes,
	formatTimelineDay,
	nightsLabel,
	nightsSummary,
	startsWithEmoji,
} from "@/utils/planFormat";
import { shortenMemberNames, shortenPeopleList } from "@/utils/nameFormat";
import { nameWithoutLeadingEmoji } from "@/utils/emoji";

/**
 * The plan as a plain-text message you can paste to the group chat.
 *
 * Kept pure (and out of the view) so it can be exercised directly: the
 * dated part is read straight off `timelineOf`, the same derivation the
 * on-screen timeline uses, so the copy can never fall out of step with it.
 */

/** The four toggles every kind of row shares. */
export interface PlanShareRowDetail {
	notes: boolean;
	people: boolean;
	costs: boolean;
	/** An idea's location, a stay's street address. */
	address: boolean;
}

/**
 * How much of the plan the copied message carries.
 *
 * `general` holds the masters: a row's own toggle only applies when its
 * General counterpart is on, so switching one off there silences that detail
 * across every kind at once. The per-kind boxes keep their own state while
 * that happens, so flipping the master back restores exactly what was set.
 */
export interface PlanShareDetail {
	/** Name, dates, location and the member list — the whole header block. */
	overview: boolean;
	/** Type icons, the 📍 pin — and any emoji typed into an item's own text,
	 * which would otherwise survive "no emojis". A cost figure has no emoji
	 * to begin with; it reads as money on its own. */
	emojis: boolean;
	/**
	 * Print a heading for every day the plan spans, including ones with
	 * nothing on them — so the message shows what's still free, not just
	 * what's booked. Off by default: most plans are pasted to show the
	 * itinerary, and blank days make it longer without adding anything.
	 */
	emptyDates: boolean;
	general: PlanShareRowDetail;
	idea: PlanShareRowDetail;
	travel: PlanShareRowDetail;
	accommodation: PlanShareRowDetail;
}

/** Which group a timeline row answers to. Drafts read as ideas. */
export type PlanShareGroup = "general" | "idea" | "travel" | "accommodation";

const ALL_ON: PlanShareRowDetail = {
	notes: true,
	people: true,
	costs: true,
	address: true,
};

export const PLAN_SHARE_DETAIL_DEFAULTS: PlanShareDetail = {
	overview: true,
	emojis: true,
	emptyDates: false,
	// Each of these four starts off at the General master: every one is a
	// detail worth adding deliberately rather than one that should bloat a
	// first copy. Held at the master rather than per-kind, so the per-kind
	// boxes stay at ALL_ON underneath — greyed out, not unticked, the moment
	// this loads. One tick on the master then turns a detail on everywhere
	// at once, and switching it back off restores exactly that everywhere
	// rather than making the tick be redone group by group.
	general: { notes: false, people: false, costs: false, address: false },
	idea: { ...ALL_ON },
	travel: { ...ALL_ON },
	accommodation: { ...ALL_ON },
};

/**
 * What a row actually shows: its own toggle ANDed with the General master.
 *
 * Exported because the modal needs the same answer to know which controls to
 * grey out — one rule, rather than the UI and the output each deciding.
 */
export function effectiveRowDetail(
	detail: PlanShareDetail,
	source: PlanTimelineEntry["source"]
): PlanShareRowDetail {
	const own = detail[source === "draft" ? "idea" : source];
	const master = detail.general;
	return {
		notes: master.notes && own.notes,
		people: master.people && own.people,
		costs: master.costs && own.costs,
		address: master.address && own.address,
	};
}

/** The shared toggles, in display order. */
export const PLAN_SHARE_ROW_FIELDS: {
	id: keyof PlanShareRowDetail;
	label: string;
}[] = [
	{ id: "address", label: "Address" },
	{ id: "notes", label: "Notes" },
	{ id: "people", label: "People" },
	{ id: "costs", label: "Costs" },
];

/** The groups, in display order. Lives here so the list and the behaviour it
 * drives can't drift apart. */
export const PLAN_SHARE_GROUPS: { id: PlanShareGroup; label: string }[] = [
	{ id: "general", label: "General" },
	{ id: "idea", label: "Ideas" },
	{ id: "travel", label: "Travel" },
	{ id: "accommodation", label: "Accommodation" },
];

export interface PlanShareOptions {
	/** You're on the trip too — you lead the member list. */
	yourName: string;
	/** Member display names, already resolved from wikilinks. */
	members: string[];
	/** Invited-but-unconfirmed display names, likewise resolved. */
	unconfirmed: string[];
	/** Omitted means every default — see PLAN_SHARE_DETAIL_DEFAULTS. */
	detail?: PlanShareDetail;
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

	if (!endDay || endDay.getTime() === startDate.getTime()) {
		return formatShortWeekdayDate(startDate);
	}
	return `${formatShortWeekdayDate(startDate)} - ${formatShortWeekdayDate(
		endDay
	)}`;
}

/**
 * Every ISO day the plan spans, or [] when it isn't day-precise at both ends.
 * The guard mirrors the timeline's: a mistyped year shouldn't spin here.
 */
function planDays(data: Record<string, unknown>): string[] {
	const exact = (v: unknown) => {
		const flex =
			typeof v === "string" || typeof v === "number" ? v : undefined;
		const parsed = parseFlexDate(flex);
		if (!parsed) return null;
		const { year, month, day } = parsed;
		if (year === null || month === null || day === null) return null;
		return new Date(year, month - 1, day);
	};
	const start = exact(data.date);
	if (!start) return [];
	const end = exact(data.endDate) ?? start;
	if (end < start) return [];

	const pad = (n: number) => String(n).padStart(2, "0");
	const days: string[] = [];
	const cursor = new Date(start);
	let guard = 0;
	while (cursor <= end && guard++ < 400) {
		days.push(
			`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(
				cursor.getDate()
			)}`
		);
		cursor.setDate(cursor.getDate() + 1);
	}
	return days;
}

/**
 * One timeline row as share text: when — what (meta), with a stay's address
 * and notes on their own lines, since that's exactly the detail people ask
 * for after you send the plan.
 */
export function planShareLines(
	entry: PlanTimelineEntry,
	/** Everyone on the plan, so first names disambiguate consistently. */
	roster: string[] = [],
	detail: PlanShareDetail = PLAN_SHARE_DETAIL_DEFAULTS
): string[] {
	const isStay = entry.source === "accommodation";
	const when = isStay
		? "Sleeping at"
		: entry.time
		? formatItemTime(entry.time)
		: "";

	// How long / who — each its own bullet, so the people never run on from
	// the timing. Names stay comma-joined inside their bullet. No wrapping
	// brackets: the stay summary brings its own, and they'd nest.
	const show = effectiveRowDetail(detail, entry.source);

	const bits: string[] = [];
	if (entry.duration) bits.push(entry.duration);
	if (entry.nights) bits.push(nightsSummary(entry.date, entry.nights));
	if (show.people && entry.people) {
		bits.push(shortenPeopleList(entry.people, roster));
	}
	// No 💵 here regardless of the Emojis toggle — a dollar figure already
	// reads as money without it, unlike a bare place name or type icon.
	if (show.costs && entry.cost !== undefined) {
		bits.push(formatItemCost(entry.cost));
	}

	// Emojis off strips the type icon *and* one already typed into the text —
	// otherwise "no emojis" still produces emojis.
	const text = detail.emojis
		? entry.text
		: nameWithoutLeadingEmoji(entry.text);
	const icon =
		detail.emojis && !startsWithEmoji(entry.text) ? `${entry.emoji} ` : "";

	const meta = bits.length > 0 ? ` • ${bits.join(" • ")}` : "";
	const lines = [`- ${when ? `${when} — ` : ""}${icon}${text}${meta}`];

	// A stay calls it an address, an idea calls it a location — one toggle
	// each, under their own group.
	const place = show.address ? entry.address ?? entry.location : undefined;
	if (place) lines.push(`  ${detail.emojis ? "📍 " : ""}${place}`);

	if (show.notes && entry.notes) lines.push(`  ${entry.notes}`);
	return lines;
}

export function buildPlanShareText(
	data: Record<string, unknown>,
	opts: PlanShareOptions
): string {
	const detail = opts.detail ?? PLAN_SHARE_DETAIL_DEFAULTS;
	const lines: string[] = [];

	// A blank line *between* blocks, never before the first one — dropping the
	// overview must not leave the message starting on an empty line.
	const section = (title: string) => {
		if (lines.length > 0) lines.push("");
		lines.push(title);
	};

	// You're on the trip too — lead with your name, deduped in case you're
	// also listed as a member.
	const yourName = opts.yourName;
	const memberNames = opts.members.filter(
		(n) => !yourName || n.toLowerCase() !== yourName.toLowerCase()
	);
	const fullNames = yourName ? [yourName, ...memberNames] : memberNames;
	// Shorten across the whole pool so dupes disambiguate consistently.
	const roster = [...fullNames, ...opts.unconfirmed];
	const shortened = shortenMemberNames(roster);
	const names = shortened.slice(0, fullNames.length);
	const unconfirmedNames = shortened.slice(fullNames.length);

	// The roster above is needed either way — it's what shortens names on the
	// individual rows — but the header block itself is optional.
	if (detail.overview) {
		// toText rather than String(): frontmatter is user-editable, so these
		// can be any YAML shape, and a stray list or map should read as empty
		// rather than "[object Object]" in a message you paste to friends.
		lines.push(toText(data.name));
		const range = formatPlanDateRange(data.date, data.endDate);
		if (range) lines.push(range);
		const location = toText(data.location);
		if (location) lines.push(location);
		if (names.length > 0) {
			lines.push(`${names.join(", ")} (${names.length})`);
		}
		if (unconfirmedNames.length > 0) {
			lines.push(`Unconfirmed: ${unconfirmedNames.join(", ")}`);
		}
	}

	// Everything dated, day by day, in timeline order.
	const byDay = new Map<string, PlanTimelineEntry[]>();
	for (const entry of PlanOperations.timelineOf(data)) {
		const list = byDay.get(entry.date) ?? [];
		list.push(entry);
		byDay.set(entry.date, list);
	}
	// `timelineOf` is already sorted, so its key order is chronological —
	// which is what keeps the default output byte-identical. Folding in the
	// plan's own span needs an explicit sort, and ISO dates sort correctly
	// as plain strings.
	const days = detail.emptyDates
		? [...new Set([...planDays(data), ...byDay.keys()])].sort()
		: [...byDay.keys()];
	for (const day of days) {
		section(formatTimelineDay(day));
		for (const entry of byDay.get(day) ?? []) {
			lines.push(...planShareLines(entry, roster, detail));
		}
	}

	// Undated items still have to appear somewhere, or copying would quietly
	// drop them.
	const undatedTravel = PlanOperations.simpleListOf(data, "travel").filter(
		(t) => !t.date
	);
	if (undatedTravel.length > 0) {
		const travelShow = effectiveRowDetail(detail, "travel");
		section("Travel:");
		undatedTravel.forEach((t) => {
			const icon =
				detail.emojis && t.type ? `${TRAVEL_TYPE_EMOJI[t.type]} ` : "";
			const bits = [
				t.duration,
				travelShow.people && t.people
					? shortenPeopleList(t.people, roster)
					: "",
				travelShow.costs && t.cost !== undefined
					? formatItemCost(t.cost)
					: "",
			].filter(Boolean);
			const meta = bits.length > 0 ? ` • ${bits.join(" • ")}` : "";
			const text = detail.emojis ? t.text : nameWithoutLeadingEmoji(t.text);
			lines.push(`- ${icon}${text}${meta}`);
		});
	}

	const undatedStay = PlanOperations.simpleListOf(
		data,
		"accommodation"
	).filter((a) => !a.date);
	if (undatedStay.length > 0) {
		const stayShow = effectiveRowDetail(detail, "accommodation");
		section("Staying:");
		undatedStay.forEach((a) => {
			const icon = detail.emojis
				? `${(a.stay && ACCOMMODATION_EMOJI[a.stay]) || "🛏️"} `
				: "";
			const bits = [
				a.nights ? nightsLabel(a.nights) : "",
				stayShow.costs && a.cost !== undefined
					? formatItemCost(a.cost)
					: "",
			].filter(Boolean);
			const meta = bits.length > 0 ? ` • ${bits.join(" • ")}` : "";
			const text = detail.emojis ? a.text : nameWithoutLeadingEmoji(a.text);
			lines.push(`- ${icon}${text}${meta}`);
		});
	}

	// What's left is the menu: ideas nobody has pinned to a day yet —
	// must-dos first, maybes marked.
	const undatedIdeas = PlanOperations.itemsOf(data).filter((i) => !i.date);
	if (undatedIdeas.length > 0) {
		section("Ideas:");
		const label = (i: { text: string }) =>
			detail.emojis ? i.text : nameWithoutLeadingEmoji(i.text);
		const musts = undatedIdeas.filter((i) => i.priority === "must");
		const maybes = undatedIdeas.filter((i) => i.priority !== "must");
		musts.forEach((i) => lines.push(`- ${label(i)}`));
		maybes.forEach((i) => lines.push(`- ${label(i)} (if there's time)`));
	}

	// Checked state stays personal — the message lists everything.
	const bring = PlanOperations.bringOf(data);
	if (bring.length > 0) {
		section("Bring:");
		bring.forEach((b) =>
			lines.push(
				`- ${detail.emojis ? b.text : nameWithoutLeadingEmoji(b.text)}`
			)
		);
	}

	return lines.join("\n");
}

/**
 * A plan timeline row as a Google Calendar "add event" link — the same
 * prefilled-template approach the Event view modal uses, so one tap lands on
 * Google's own Save screen rather than handing off a file.
 *
 * How long the thing runs differs by kind, which is the whole reason this
 * doesn't just reuse buildGoogleCalendarUrl:
 *
 * - an idea or a leg runs for its `duration`, defaulting to an hour when it
 *   has none — the same default Google fills in for an event made by hand
 * - a stay spans its nights, timed by check-in and check-out when both are
 *   set and all-day when they aren't, because a booking with no hours on it
 *   genuinely is an all-day thing rather than one starting at midnight
 *
 * Null when the row has no day-precision date — there'd be nowhere to put it.
 */
export function buildTimelineCalendarUrl(
	entry: PlanTimelineEntry
): string | null {
	const start = new Date(`${entry.date}T00:00:00`);
	if (!entry.date || isNaN(start.getTime())) return null;

	const pad = (n: number) => String(n).padStart(2, "0");
	const day = (d: Date) =>
		`${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
	const stamp = (d: Date) =>
		`${day(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

	const isStay = entry.source === "accommodation";
	// A stay ends after its nights; everything else lands on its own day.
	const lastDay = new Date(start);
	if (isStay) lastDay.setDate(lastDay.getDate() + Math.max(entry.nights ?? 1, 1));

	const hourOf = (value: string | undefined) => {
		const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
		return match
			? { hour: Number(match[1]), minute: Number(match[2]) }
			: null;
	};

	let dates: string;
	if (isStay) {
		const checkIn = hourOf(entry.checkIn);
		const checkOut = hourOf(entry.checkOut);
		if (checkIn && checkOut) {
			const from = new Date(start);
			from.setHours(checkIn.hour, checkIn.minute, 0, 0);
			const to = new Date(lastDay);
			to.setHours(checkOut.hour, checkOut.minute, 0, 0);
			dates = `${stamp(from)}/${stamp(to)}`;
		} else {
			// All-day. Google's end is exclusive, and `lastDay` is already
			// the morning after the final night — exactly that boundary.
			dates = `${day(start)}/${day(lastDay)}`;
		}
	} else {
		const at = hourOf(entry.time);
		if (at) {
			const from = new Date(start);
			from.setHours(at.hour, at.minute, 0, 0);
			const minutes = parseDurationMinutes(entry.duration) ?? 60;
			const to = new Date(from.getTime() + minutes * 60000);
			dates = `${stamp(from)}/${stamp(to)}`;
		} else {
			// No clock time — a whole day, end exclusive.
			const to = new Date(start);
			to.setDate(to.getDate() + 1);
			dates = `${day(start)}/${day(to)}`;
		}
	}

	// The row's own emoji leads, unless its text already brings one — the
	// same rule the timeline itself renders by.
	const title = startsWithEmoji(entry.text)
		? entry.text
		: `${entry.emoji} ${entry.text}`;
	const place = entry.address ?? entry.location;

	const params = [
		"action=TEMPLATE",
		`text=${encodeURIComponent(title)}`,
		`dates=${dates}`,
		entry.notes && `details=${encodeURIComponent(entry.notes)}`,
		place && `location=${encodeURIComponent(place)}`,
	].filter(Boolean);

	return `https://calendar.google.com/calendar/render?${params.join("&")}`;
}
