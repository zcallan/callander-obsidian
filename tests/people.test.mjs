import { createSuite } from "./harness.mjs";
import { createTestVault } from "./vault.mjs";
import {
	compareByFirstName,
	resolvePeopleInfo,
	resolvePeopleNames,
} from "./.build/callander.mjs";

/**
 * Resolving a people list to the names it should render as. The interesting
 * cases are the ones that aren't contacts: a guest typed by hand, and a
 * wikilink whose file has since gone.
 */
export async function run() {
	const { eq, result } = createSuite("people resolution");

	const t = await createTestVault();
	const source = `${t.plugin.settings.baseFolder}/Dashboard.md`;
	await t.addPerson("Riley Sorensen", { displayName: "Riley Sorensen" });
	await t.addPerson("Sam Okafor", {
		displayName: "Sam Okafor",
		shortName: "Sammy",
	});
	await t.addPerson("Basename Only");

	eq(
		"a wikilink resolves to the contact's displayName",
		resolvePeopleNames(t.app, source, ["[[Riley Sorensen]]"]),
		["Riley Sorensen"]
	);

	eq(
		"a bare name passes straight through as a guest",
		resolvePeopleNames(t.app, source, ["Jordan from work"]),
		["Jordan from work"]
	);

	eq(
		"contacts and guests mix in one list, in order",
		resolvePeopleNames(t.app, source, [
			"[[Riley Sorensen]]",
			"Jordan from work",
			"[[Sam Okafor]]",
		]),
		["Riley Sorensen", "Jordan from work", "Sam Okafor"]
	);

	eq(
		"a wikilink to a file that no longer exists keeps its linktext",
		resolvePeopleNames(t.app, source, ["[[Deleted Person]]"]),
		["Deleted Person"]
	);

	eq(
		"a contact with no displayName falls back to its basename",
		resolvePeopleNames(t.app, source, ["[[Basename Only]]"]),
		["Basename Only"]
	);

	// shortName rides along, since it's what drives nickname overrides.
	const info = resolvePeopleInfo(t.app, source, [
		"[[Sam Okafor]]",
		"Jordan from work",
	]);
	eq("a contact's shortName comes through", info[0].shortName, "Sammy");
	eq("a guest has no shortName", info[1].shortName, "");

	eq("an empty list resolves to nothing", resolvePeopleNames(t.app, source, []), []);

	// ---------- ordering people for a picker ----------
	const sorted = (names) => [...names].sort(compareByFirstName);

	eq(
		"sorts by first name, not by surname",
		sorted(["Zoe Abbott", "Ada Zephyr", "Milo Baker"]),
		["Ada Zephyr", "Milo Baker", "Zoe Abbott"]
	);
	eq(
		"same first name falls back to the full name",
		sorted(["Riley Sorensen", "Riley Adams", "Riley Turner"]),
		["Riley Adams", "Riley Sorensen", "Riley Turner"]
	);
	eq(
		"case doesn't split the alphabet",
		sorted(["bea Lin", "Ada Fenwick", "Cal Reed"]),
		["Ada Fenwick", "bea Lin", "Cal Reed"]
	);
	eq(
		"accents sort next to their plain form",
		sorted(["Zoë Marsh", "Zoe Abbott", "Yuki Tan"]),
		["Yuki Tan", "Zoe Abbott", "Zoë Marsh"]
	);
	eq(
		"a single-word name sorts on itself",
		sorted(["Prince", "Ada Fenwick"]),
		["Ada Fenwick", "Prince"]
	);

	return result();
}
