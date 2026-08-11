/**
 * Rendering people's names for your own reading — shortened to first names,
 * disambiguated when two would collide, with per-contact overrides.
 *
 * Nothing here is specific to any one feature: timelines, expenses, events
 * and somedays all render rosters the same way, so a person reads as the
 * same name wherever they turn up.
 */

/**
 * Order two people by first name, the way you'd look for someone in a list.
 *
 * Collating the whole name is all this needs. The space between first and
 * last sorts ahead of any letter, so "Bo Zephyr" lands before "Bob Adams"
 * exactly as comparing first names alone would, and two people sharing a
 * first name fall back to their surnames. Splitting the first name out
 * explicitly cannot change the result for any "First Last" name.
 *
 * localeCompare's default collation is also what keeps "bea" filed under B
 * rather than after every capital letter, and "Zoë" next to "Zoe" — no
 * sensitivity option needed, since that only affects when two names compare
 * *equal*, not how distinct ones order.
 */
export function compareByFirstName(a: string, b: string): number {
	return a.trim().localeCompare(b.trim());
}

/**
 * "Riley" — or "Riley P" when two Rileys would otherwise collide. A name
 * with an override in `shortNames` (keyed by full name, lowercased) skips
 * all of that and renders exactly as given — and doesn't count toward
 * anyone else's collision either, since it's no longer showing as "Riley"
 * at all. Two other Rileys still disambiguate against each other; a Riley
 * with an override never forces that on them.
 */
export function shortenMemberNames(
	fullNames: string[],
	shortNames: Map<string, string> = new Map()
): string[] {
	const overrideFor = (name: string) =>
		shortNames.get(name.trim().toLowerCase());
	const firstCounts = new Map<string, number>();
	for (const name of fullNames) {
		if (overrideFor(name)) continue;
		const first = name.trim().split(/\s+/)[0].toLowerCase();
		firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1);
	}
	return fullNames.map((name) => {
		const override = overrideFor(name);
		if (override) return override;
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
 * `shortNames` for shortenMemberNames/shortenPeopleList, built from
 * whatever contacts are in view. Only for the user's own reading — never
 * pass this into shared text, where a private nickname would mean nothing
 * to whoever receives the message (same reasoning as `yourName` below).
 */
export function shortNameOverrides(
	contacts: Array<{ displayName: string; shortName: string }>
): Map<string, string> {
	const map = new Map<string, string>();
	for (const c of contacts) {
		const override = c.shortName.trim();
		if (override) map.set(c.displayName.trim().toLowerCase(), override);
	}
	return map;
}

/**
 * An item's comma-separated `people` as first names — "Austin Philleo,
 * Riley Sorensen" reads "Austin, Riley".
 *
 * Disambiguated against the whole roster rather than just this row, so a
 * roster with two Rileys renders "Riley S" on every row that has her, not
 * a bare "Riley" on rows where she happens to be the only one. Names typed
 * free-hand (not on the roster) still shorten, and fold into the same
 * collision check.
 *
 * `yourName` (from settings) renders as "Me" — you already know who you
 * are, and it reads the way you'd say it. Only for your own views: anything
 * shared as a message keeps real names, since "Me" means nothing to whoever
 * receives it. `shortNames` overrides (see shortNameOverrides) follow the
 * same rule, for the same reason.
 */
export function shortenPeopleList(
	people: string,
	roster: string[],
	yourName = "",
	shortNames: Map<string, string> = new Map()
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
	const shortened = shortenMemberNames(pool, shortNames);
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
