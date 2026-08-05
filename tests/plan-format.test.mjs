import { createSuite } from "./harness.mjs";
import {
	shortenMemberNames,
	shortenPeopleList,
	shortNameOverrides,
} from "./.build/callander.mjs";

/**
 * The Short Name override lets a friend's shortened/disambiguated form be
 * set explicitly ("Obama" instead of a computed "Barack" or "Barack O").
 * The interesting failure mode isn't the override itself — it's whether an
 * overridden person still silently forces a disambiguating suffix onto
 * someone else who, in the final rendered output, no longer collides with
 * anything.
 */
export function run() {
	const { eq, result } = createSuite("plan format (short names)");

	// ---------- shortenMemberNames: existing behaviour, no overrides ----------
	eq("first name alone when unique", shortenMemberNames(["Austin Philleo"]), [
		"Austin",
	]);
	eq(
		"disambiguates a real collision",
		shortenMemberNames(["Riley Sorensen", "Riley Park"]),
		["Riley S", "Riley P"]
	);
	eq(
		"a single-word name has no second word to suffix with, so stays bare",
		shortenMemberNames(["Riley", "Riley Park"]),
		["Riley", "Riley P"]
	);

	// ---------- overrides ----------
	eq(
		"override wins even with no collision at all",
		shortenMemberNames(["Barack Obama"], new Map([["barack obama", "Obama"]])),
		["Obama"]
	);
	eq(
		"override lookup is case/whitespace-insensitive",
		shortenMemberNames(
			["  BARACK obama  "],
			new Map([["barack obama", "Obama"]])
		),
		["Obama"]
	);
	eq(
		"overridden person no longer collides, so the other Barack goes bare",
		shortenMemberNames(
			["Barack Obama", "Barack Chen"],
			new Map([["barack obama", "Obama"]])
		),
		["Obama", "Barack"]
	);
	eq(
		"a real collision among the non-overridden still disambiguates",
		shortenMemberNames(
			["Barack Obama", "Barack Chen", "Barack Lee"],
			new Map([["barack obama", "Obama"]])
		),
		["Obama", "Barack C", "Barack L"]
	);
	eq(
		"unrelated names are untouched by someone else's override",
		shortenMemberNames(
			["Barack Obama", "Riley Sorensen", "Riley Park"],
			new Map([["barack obama", "Obama"]])
		),
		["Obama", "Riley S", "Riley P"]
	);

	// ---------- shortenPeopleList ----------
	eq(
		"shortenPeopleList applies the override within a people string",
		shortenPeopleList(
			"Barack Obama, Barack Chen",
			["Barack Obama", "Barack Chen"],
			"",
			new Map([["barack obama", "Obama"]])
		),
		"Obama, Barack"
	);
	eq(
		"free-hand names not on the roster still pick up an override",
		shortenPeopleList(
			"Barack Obama",
			[],
			"",
			new Map([["barack obama", "Obama"]])
		),
		"Obama"
	);
	eq(
		"\"Me\" still wins over an override for yourName's own row",
		shortenPeopleList(
			"Callan",
			["Callan"],
			"Callan",
			new Map([["callan", "Cal"]])
		),
		"Me"
	);
	eq(
		"omitting shortNames entirely behaves exactly as before",
		shortenPeopleList("Barack Obama, Barack Chen", [
			"Barack Obama",
			"Barack Chen",
		]),
		"Barack O, Barack C"
	);

	// ---------- shortNameOverrides ----------
	const map = shortNameOverrides([
		{ displayName: "Barack Obama", shortName: "Obama" },
		{ displayName: "Riley Sorensen", shortName: "" },
		{ displayName: "Laura Morton", shortName: "   " },
	]);
	eq("map size excludes blank/whitespace-only shortNames", map.size, 1);
	eq(
		"keyed by lowercased, trimmed displayName",
		map.get("barack obama"),
		"Obama"
	);
	eq("no entry for a contact without one", map.has("riley sorensen"), false);

	return result();
}
