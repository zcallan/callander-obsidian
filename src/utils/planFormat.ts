import { roughTime } from "@/constants";
import { formatDate, ordinalDay } from "@/utils/dateFormat";

/**
 * Display helpers shared by the plan timeline and its read view, so a stay
 * that reads "3 nights (Thu-Sun)" in one place reads the same in the other.
 */

/** "Thursday 30 July" from an ISO date. */
export function formatTimelineDay(iso: string): string {
	const d = new Date(`${iso}T00:00:00`);
	if (isNaN(d.getTime())) return iso;
	return formatDate(d, {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
}

/** A rough label ("Dinner time") when that's all we know, else a 12h clock. */
export function formatItemTime(time: string): string {
	const rough = roughTime(time);
	if (rough) return rough.label;
	const m = /^(\d{1,2}):(\d{2})$/.exec(time);
	if (!m) return time;
	let hour = parseInt(m[1], 10);
	const minute = m[2];
	const ampm = hour >= 12 ? "pm" : "am";
	hour = hour % 12 || 12;
	return `${hour}:${minute}${ampm}`;
}

export function formatItemCost(cost: number): string {
	return cost === 0 ? "Free" : `$${cost}`;
}

/**
 * The span of a stay: "Thu-Sun" up to six nights, and "until Thu 21st"
 * beyond that — a week or more wraps around to the same weekday, where
 * "Thu-Thu" says nothing.
 *
 * Null for a single night — the day heading it already sits under answers
 * "until when?", so spelling out one night's span is just noise.
 */
export function stayRange(dateISO: string, nights: number): string | null {
	if (nights < 2) return null;
	const start = new Date(`${dateISO}T00:00:00`);
	if (isNaN(start.getTime())) return null;
	const end = new Date(start);
	end.setDate(end.getDate() + nights);
	const weekday = (d: Date) => formatDate(d, { weekday: "short" });
	if (nights > 6) {
		return `until ${weekday(end)} ${ordinalDay(end.getDate())}`;
	}
	return `${weekday(start)}-${weekday(end)}`;
}

/** "3 nights (Thu-Sun)" — how a stay's length reads across the plan views. */
export function nightsSummary(dateISO: string, nights: number): string {
	const range = stayRange(dateISO, nights);
	return `${nightsLabel(nights)}${range ? ` (${range})` : ""}`;
}

/** "2 nights" / "1 night" — the stay-length phrase used in both views. */
export function nightsLabel(nights: number): string {
	return nights === 1 ? "1 night" : `${nights} nights`;
}

/** True when the text already leads with an emoji/pictograph. */
export function startsWithEmoji(text: string): boolean {
	return /^\p{Extended_Pictographic}/u.test(text.trim());
}

/** How an expense is divided, for display: "By receipt", "Split evenly"… */
export function splitModeLabel(
	mode: "even" | "shares" | "percent" | "value" | "receipt"
): string {
	switch (mode) {
		case "percent":
			return "By percent";
		case "shares":
			return "By shares";
		case "value":
			return "By value";
		case "receipt":
			return "By receipt";
		default:
			return "Split evenly";
	}
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

/**
 * An item's comma-separated `people` as first names — "Austin Philleo,
 * Riley Sorensen" reads "Austin, Riley".
 *
 * Disambiguated against the whole plan roster rather than just this row, so
 * a plan with two Rileys renders "Riley S" on every row that has her, not
 * a bare "Riley" on rows where she happens to be the only one. Names typed
 * free-hand (not on the roster) still shorten, and fold into the same
 * collision check.
 *
 * `yourName` (from settings) renders as "Me" — you already know who you
 * are, and it reads the way you'd say it. Only for your own views: a plan
 * shared as a message keeps real names, since "Me" means nothing to whoever
 * receives it.
 */
export function shortenPeopleList(
	people: string,
	roster: string[],
	yourName = ""
): string {
	const names = people
		.split(",")
		.map((n) => n.trim())
		.filter(Boolean);
	if (names.length === 0) return "";

	const pool = [...roster];
	for (const name of names) {
		if (!pool.some((p) => p.toLowerCase() === name.toLowerCase())) {
			pool.push(name);
		}
	}
	const shortened = shortenMemberNames(pool);
	const byFullName = new Map<string, string>();
	pool.forEach((full, i) => byFullName.set(full.toLowerCase(), shortened[i]));

	const you = yourName.trim().toLowerCase();
	return names
		.map((name) => {
			if (you && name.toLowerCase() === you) return "Me";
			return byFullName.get(name.toLowerCase()) ?? name;
		})
		.join(", ");
}
