/**
 * Timezones for event times.
 *
 * An event's `time` is a *floating* time by default: "7pm" means 7pm
 * wherever the event happens, and nothing converts it. That's the right
 * answer for most of what goes in here — a dinner on a trip is at 7pm
 * local, and showing it as 8pm because you booked it from another state
 * would be actively wrong.
 *
 * Some times are quoted in a specific zone though — a game listed as 12pm
 * CT — and those want converting for whoever's reading. Setting `timezone`
 * on an event says "this clock time belongs to that zone", and everything
 * downstream sees it already converted.
 *
 * The conversion can move the event to a different **day**: 9pm Pacific is
 * midnight Eastern, the next date. That's handled by resolving the date and
 * the time together, at the point events are read, so every calendar cell,
 * week heading and sort sees a date that agrees with the time beside it.
 *
 * No library: `Intl.DateTimeFormat` knows the whole IANA database including
 * every DST rule, which is the only hard part.
 */

/** A zone offered in the pickers. */
export interface Zone {
	/** IANA id, as stored. */
	id: string;
	/** What the dropdown shows. */
	label: string;
}

/**
 * The zones on offer — deliberately a short list rather than the ~400 `Intl`
 * knows. These cover the cases this is for (US sports and TV listings,
 * mostly, plus the handful of places a call or a flight is quoted in), and a
 * dropdown you can read beats one that's merely complete.
 *
 * Stored as IANA ids, never abbreviations: "CT" isn't a real zone, and
 * whether Chicago is CST or CDT depends on the date.
 */
export const ZONES: readonly Zone[] = [
	{ id: "America/New_York", label: "Eastern" },
	{ id: "America/Chicago", label: "Central" },
	{ id: "America/Denver", label: "Mountain" },
	{ id: "America/Los_Angeles", label: "Pacific" },
	{ id: "America/Anchorage", label: "Alaska" },
	{ id: "Pacific/Honolulu", label: "Hawaii" },
	{ id: "UTC", label: "UTC" },
	{ id: "Europe/London", label: "London" },
	{ id: "Europe/Paris", label: "Paris" },
	{ id: "Asia/Tokyo", label: "Tokyo" },
	{ id: "Australia/Sydney", label: "Sydney" },
];

/**
 * Cities worth naming a group after, when one of them is in it.
 *
 * Intl lists zones alphabetically, so left alone the Caribbean would be
 * represented by Anguilla and western Europe by Amsterdam. There's no
 * population data to sort by, so this is the thumb on the scale — the
 * cities someone scanning for their own zone is most likely to recognise.
 * Anything not listed falls back to alphabetical, which is fine for the
 * groups nobody is hunting for.
 */
const NOTABLE = [
	"America/New_York", "America/Chicago", "America/Denver",
	"America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu",
	"America/Toronto", "America/Vancouver", "America/Mexico_City",
	"America/Bogota", "America/Lima", "America/Santiago",
	"America/Sao_Paulo", "America/Argentina/Buenos_Aires",
	"America/Puerto_Rico", "America/Halifax", "America/St_Johns",
	"Europe/London", "Europe/Dublin", "Europe/Lisbon", "Europe/Paris",
	"Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam",
	"Europe/Athens", "Europe/Helsinki", "Europe/Kyiv", "Europe/Moscow",
	"Europe/Istanbul", "Atlantic/Reykjavik",
	"Africa/Lagos", "Africa/Cairo", "Africa/Nairobi",
	"Africa/Johannesburg", "Africa/Casablanca",
	"Asia/Jerusalem", "Asia/Dubai", "Asia/Karachi", "Asia/Calcutta",
	"Asia/Kolkata", "Asia/Kathmandu", "Asia/Dhaka", "Asia/Bangkok",
	"Asia/Jakarta", "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai",
	"Asia/Manila", "Asia/Tokyo", "Asia/Seoul", "Asia/Tehran",
	"Australia/Perth", "Australia/Adelaide", "Australia/Brisbane",
	"Australia/Sydney", "Pacific/Auckland", "Pacific/Fiji",
];

/** Where a zone ranks for naming a group; unlisted sorts last. */
function notability(id: string): number {
	const i = NOTABLE.indexOf(id);
	return i === -1 ? NOTABLE.length : i;
}

/** "Europe/Madrid" → "Madrid". */
function cityOf(id: string): string {
	return id.split("/").pop()?.replace(/_/g, " ") ?? id;
}

/**
 * Every zone `Intl` knows, collapsed to the ones that actually behave
 * differently, ordered by how far each is from UTC.
 *
 * Intl lists 418 zones, which is far more choice than it looks: 33 of them
 * are western Europe keeping identical time, 31 are Caribbean islands all
 * fixed at -4. Probing each one's offset twice a month for a year sorts
 * them into about 60 genuinely distinct behaviours — the same collapse
 * every other timezone picker does, and why theirs are short.
 *
 * A group is labelled with its offset and the cities in it people are
 * likeliest to know, and stores the id of the first of those. Anyone in
 * that group gets the same conversion from it as they would from their own
 * city's id, because behaving identically is what put them in it. The
 * device's own zone is offered exactly regardless — see deviceZoneOption.
 *
 * Offsets are read as they stand now, so a label can move by an hour when
 * a zone's clocks change. That's dropdown text; the conversion itself
 * always re-reads the offset for the event's own date.
 *
 * Built once and kept — about 70ms, paid on the first dropdown and never
 * again. Empty on a runtime without `supportedValuesOf`, which leaves the
 * curated list standing on its own.
 */
let everyZone: readonly Zone[] | null = null;

export function allZones(): readonly Zone[] {
	if (everyZone) return everyZone;
	let ids: string[];
	try {
		const supported = (
			Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
		).supportedValuesOf;
		ids = supported ? supported.call(Intl, "timeZone") : [];
	} catch {
		ids = [];
	}
	const now = new Date();
	// Through a whole year, so two zones that differ only in when they
	// change their clocks don't get treated as the same thing.
	const probes: Date[] = [];
	for (let month = 0; month < 12; month++) {
		for (const day of [1, 15]) {
			probes.push(
				new Date(
					Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + month, day, 12)
				)
			);
		}
	}

	const groups = new Map<string, string[]>();
	for (const id of ids.filter(isRegionZone)) {
		const offsets = probes.map((p) => offsetAt(p, id));
		if (offsets.some((o) => o === null)) continue;
		const signature = offsets.join(",");
		const group = groups.get(signature);
		if (group) group.push(id);
		else groups.set(signature, [id]);
	}

	everyZone = [...groups.values()]
		.map((members) => {
			const ranked = [...members].sort(
				(a, b) => notability(a) - notability(b) || a.localeCompare(b)
			);
			const offset = offsetAt(now, ranked[0]) ?? 0;
			// Up to three cities: enough to recognise the group by, few
			// enough to still read as one line. No count of the rest —
			// it's a row in a dropdown, not an inventory.
			return {
				id: ranked[0],
				offset,
				label: zoneOptionLabel(offset, ranked.slice(0, 3).map(cityOf).join(", ")),
			};
		})
		.sort((a, b) => a.offset - b.offset || a.label.localeCompare(b.label))
		.map(({ id, label }) => ({ id, label }));
	return everyZone;
}

/**
 * This machine's own zone as a picker entry, unless one of the lists
 * already offers that exact id.
 *
 * The grouping above stores a representative rather than every city, so
 * someone in Madrid would otherwise only be able to pick Paris. It
 * converts the same either way, but your own zone should be selectable by
 * its own name.
 */
export function deviceZoneOption(): Zone | null {
	const id = deviceZone();
	if (ZONES.some((z) => z.id === id)) return null;
	if (allZones().some((z) => z.id === id)) return null;
	return { id, label: zoneOptionLabel(offsetAt(new Date(), id), cityOf(id)) };
}

/**
 * "-05:00", "+05:30", "+00:00" — always signed, always padded, so a
 * dropdown of them reads as a column rather than a ragged edge.
 */
function offsetLabel(ms: number): string {
	const total = Math.round(ms / 60000);
	const sign = total < 0 ? "-" : "+";
	const abs = Math.abs(total);
	const hours = String(Math.floor(abs / 60)).padStart(2, "0");
	const minutes = String(abs % 60).padStart(2, "0");
	return `${sign}${hours}:${minutes}`;
}

/** One option's text, wherever it came from. */
function zoneOptionLabel(offset: number | null, name: string): string {
	return `(${offsetLabel(offset ?? 0)}) ${name}`;
}

/**
 * The real IANA regions. Everything else `supportedValuesOf` may hand back
 * is a pseudo-zone or a backwards-compatible alias: `Etc/GMT+10` (whose
 * sign is inverted from the one everyone expects), `US/Pacific`, bare
 * `Japan`. They'd add rows that duplicate real cities and read as noise —
 * "(-10:00) GMT+10" being the worst of them.
 */
const REGION_AREAS = new Set([
	"Africa",
	"America",
	"Antarctica",
	"Arctic",
	"Asia",
	"Atlantic",
	"Australia",
	"Europe",
	"Indian",
	"Pacific",
]);

/**
 * A real place, rather than a pseudo-zone or a legacy alias.
 *
 * Exported so this is testable on its own: which of these an `Intl` build
 * actually hands back varies with its ICU version, so a test that waits
 * for one to turn up in the list passes for the wrong reason on a runtime
 * that never emits any.
 */
export function isRegionZone(id: string): boolean {
	return REGION_AREAS.has(id.split("/")[0]) && id.includes("/");
}

/** The short list, labelled the way every other option is. */
export function commonZones(): readonly Zone[] {
	const now = new Date();
	return ZONES.map((z) => ({
		id: z.id,
		label: zoneOptionLabel(offsetAt(now, z.id), z.label),
	}));
}

/** The curated label for a zone, falling back to the id's own city. */
export function zoneLabel(id: string): string {
	const known = ZONES.find((z) => z.id === id);
	if (known) return known.label;
	// "America/Argentina/Buenos_Aires" → "Buenos Aires", for a zone typed
	// into an import rather than picked from the list.
	return id.split("/").pop()?.replace(/_/g, " ") ?? id;
}

/**
 * Formatters are expensive to build and there are only ever a handful of
 * zones in play, so each is made once.
 */
const partCache = new Map<string, Intl.DateTimeFormat>();

function partsIn(zone: string): Intl.DateTimeFormat | null {
	const cached = partCache.get(zone);
	if (cached) return cached;
	let made: Intl.DateTimeFormat;
	try {
		made = new Intl.DateTimeFormat("en-US", {
			timeZone: zone,
			// h23 rather than hour12:false — the latter reports midnight as
			// "24" on some engines, which would land a day out.
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
	} catch {
		// An id Intl doesn't know — from a hand-edited note, say. Treated as
		// no zone at all rather than throwing inside a render.
		return null;
	}
	partCache.set(zone, made);
	return made;
}

/** The wall-clock fields this instant shows in this zone. */
function fieldsAt(
	instant: Date,
	zone: string
): { y: number; mo: number; d: number; h: number; mi: number; s: number } | null {
	const formatter = partsIn(zone);
	if (!formatter) return null;
	const parts = formatter.formatToParts(instant);
	const at = (type: string) =>
		Number(parts.find((p) => p.type === type)?.value);
	const fields = {
		y: at("year"),
		mo: at("month"),
		d: at("day"),
		h: at("hour"),
		mi: at("minute"),
		s: at("second"),
	};
	return Object.values(fields).some(Number.isNaN) ? null : fields;
}

/**
 * How far this zone is from UTC at this instant, in milliseconds — DST
 * included, since it's read off the formatted result rather than a table.
 */
function offsetAt(instant: Date, zone: string): number | null {
	const f = fieldsAt(instant, zone);
	if (!f) return null;
	const asUtc = Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s);
	return asUtc - instant.getTime();
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_RE = /^(\d{1,2}):(\d{2})$/;

/**
 * The moment a wall-clock date and time name in a given zone.
 *
 * Two passes, because the offset depends on the instant and the instant
 * depends on the offset: the first guess is off by an hour when the date
 * sits on the far side of a DST change from UTC's idea of it, and the
 * second settles it.
 *
 * Null when either half isn't a plain date/clock — an "anytime" or "tbd"
 * time, or a flex date like "2026-05" with no day to pin it to.
 */
export function zonedWallTimeToInstant(
	date: string,
	time: string,
	zone: string
): Date | null {
	const d = DATE_RE.exec(date);
	const t = CLOCK_RE.exec(time);
	if (!d || !t) return null;
	const hour = Number(t[1]);
	const minute = Number(t[2]);
	if (hour > 23 || minute > 59) return null;
	const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hour, minute);
	const first = offsetAt(new Date(wall), zone);
	if (first === null) return null;
	const second = offsetAt(new Date(wall - first), zone);
	if (second === null) return null;
	// A wall time inside a spring-forward gap names an hour that doesn't
	// exist. Rather than refuse, the second pass settles on the instant
	// just *before* the jump — 2:30am on a US spring-forward Sunday comes
	// back as 1:30am. Deterministic and close, which is all an hour that
	// isn't there can be; a time in the gap is a typo or a bad import
	// either way.
	return new Date(wall - second);
}

export interface ResolvedTime {
	date: string;
	time: string;
}

/**
 * An event's stored date and time as they read in `viewerZone`.
 *
 * Returns the inputs **unchanged** whenever there's nothing to convert or
 * nothing to convert with — which is the overwhelmingly common case, and
 * the reason adding this costs existing vaults nothing:
 *
 * - no `fromZone` (a floating time — every event that predates this)
 * - the event is already in the viewer's zone
 * - the time is "anytime"/"tbd"/empty, so there's no clock to move
 * - the date has no day ("2026-05"), so there's no instant to anchor to
 * - a zone id `Intl` doesn't recognise
 */
export function resolveToZone(
	date: string,
	time: string,
	fromZone: string,
	viewerZone: string
): ResolvedTime {
	if (!fromZone || fromZone === viewerZone) return { date, time };
	const instant = zonedWallTimeToInstant(date, time, fromZone);
	if (!instant) return { date, time };
	const f = fieldsAt(instant, viewerZone);
	if (!f) return { date, time };
	const pad = (n: number) => String(n).padStart(2, "0");
	return {
		date: `${f.y}-${pad(f.mo)}-${pad(f.d)}`,
		time: `${pad(f.h)}:${pad(f.mi)}`,
	};
}

/**
 * How the zone signs itself on a given date — "CST" or "CDT", "GMT+11",
 * depending on the zone and whether summer time is in force then. The date
 * matters: the same zone abbreviates differently in January and July.
 */
export function zoneAbbreviation(date: string, zone: string): string {
	const d = DATE_RE.exec(date);
	if (!d) return "";
	// Midday, so a date lands unambiguously inside its own day whatever the
	// offset — midnight can fall on either side.
	const instant = new Date(
		Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), 12)
	);
	try {
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone: zone,
			timeZoneName: "short",
		}).formatToParts(instant);
		return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
	} catch {
		return "";
	}
}

/** The zone this machine is in. */
export function deviceZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	} catch {
		return "UTC";
	}
}

/**
 * The zone to read events in: whatever's pinned in the settings, else this
 * machine's. The one place the device fallback lives, so everything else
 * takes a zone as an argument and stays testable.
 */
export function displayZone(pinned: string | undefined): string {
	return pinned || deviceZone();
}

/**
 * Spellings a zone might arrive as from a spreadsheet — the abbreviations
 * people actually write, plus the plain names. An IANA id passes through on
 * its own, so this only has to cover what an id isn't.
 */
const ZONE_ALIASES: Record<string, string> = {
	et: "America/New_York",
	est: "America/New_York",
	edt: "America/New_York",
	eastern: "America/New_York",
	ct: "America/Chicago",
	cst: "America/Chicago",
	cdt: "America/Chicago",
	central: "America/Chicago",
	mt: "America/Denver",
	mst: "America/Denver",
	mdt: "America/Denver",
	mountain: "America/Denver",
	pt: "America/Los_Angeles",
	pst: "America/Los_Angeles",
	pdt: "America/Los_Angeles",
	pacific: "America/Los_Angeles",
	akt: "America/Anchorage",
	akst: "America/Anchorage",
	akdt: "America/Anchorage",
	alaska: "America/Anchorage",
	hst: "Pacific/Honolulu",
	hawaii: "Pacific/Honolulu",
	utc: "UTC",
	gmt: "UTC",
	bst: "Europe/London",
	london: "Europe/London",
	cet: "Europe/Paris",
	paris: "Europe/Paris",
	jst: "Asia/Tokyo",
	tokyo: "Asia/Tokyo",
	aet: "Australia/Sydney",
	sydney: "Australia/Sydney",
};

/**
 * A written zone as an IANA id — "" for empty (a floating time), null when
 * it isn't a zone at all, so an import can report it like any other bad
 * cell.
 */
export function normalizeTimezone(raw: string): string | null {
	const text = raw.trim();
	if (!text) return "";
	const alias = ZONE_ALIASES[text.toLowerCase()];
	if (alias) return alias;
	const known = ZONES.find((z) => z.id.toLowerCase() === text.toLowerCase());
	if (known) return known.id;
	// Anything else is taken only if Intl actually knows it, which is what
	// makes "Europe/Madrid" work without listing every zone here.
	return partsIn(text) ? text : null;
}
