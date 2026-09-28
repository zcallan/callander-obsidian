import { createSuite } from "./harness.mjs";
import {
	applyFrontmatterPatch,
	frontmatterPatch,
	isEmptyPatch,
	snapshotFrontmatter,
} from "./.build/callander.mjs";

/**
 * How the contact page saves: only what it changed since it last read or
 * wrote the note. These pin the two ways the old whole-object save lost
 * data — removals that never reached disk, and a stale copy written over
 * changes from another device — and that a failed read writes nothing.
 */
export function run() {
	const { eq, ok, result } = createSuite("frontmatter patch");

	// What a save does to the file: the patch applied to what's on disk.
	const save = (onDisk, before, after) => {
		const fm = structuredClone(onDisk);
		applyFrontmatterPatch(fm, frontmatterPatch(before, after));
		return fm;
	};

	// ---------- nothing, and something, changed ----------
	const loaded = { name: "Sam", groups: ["[[Run club]]"], interests: ["Tea"] };
	ok(
		"nothing changed, nothing to write",
		isEmptyPatch(frontmatterPatch(loaded, structuredClone(loaded)))
	);
	eq(
		"a changed value is written, and only it",
		frontmatterPatch(loaded, { ...loaded, name: "Samuel" }),
		{ set: { name: "Samuel" }, remove: [] }
	);
	eq(
		"a new key is written",
		frontmatterPatch({ name: "Sam" }, { name: "Sam", relationship: "friend" }),
		{ set: { relationship: "friend" }, remove: [] }
	);

	// ---------- removals reach disk, whatever the key ----------
	eq(
		"removing the last group deletes the key (it wasn't on the old list)",
		save(loaded, loaded, { name: "Sam", interests: ["Tea"] }),
		{ name: "Sam", interests: ["Tea"] }
	);
	eq(
		"...as does a plan's last quick-idea category",
		save(
			{ name: "Trip", quickIdeaCategories: ["Boston"] },
			{ name: "Trip", quickIdeaCategories: ["Boston"] },
			{ name: "Trip" }
		),
		{ name: "Trip" }
	);
	eq(
		"...and a legacy notes key once migrated into the body",
		save(
			{ name: "Sam", notes: "Met at uni" },
			{ name: "Sam", notes: "Met at uni" },
			{ name: "Sam" }
		),
		{ name: "Sam" }
	);

	// ---------- keys the page didn't touch are left as they are on disk ----------
	eq(
		"a key another device added since the page loaded survives the save",
		save({ ...loaded, pronouns: ["they"] }, loaded, { ...loaded, name: "Samuel" }),
		{ ...loaded, name: "Samuel", pronouns: ["they"] }
	);
	eq(
		"a key another device changed isn't overwritten by the page's older copy",
		save({ ...loaded, interests: ["Tea", "Jazz"] }, loaded, { ...loaded, name: "Samuel" }),
		{ ...loaded, name: "Samuel", interests: ["Tea", "Jazz"] }
	);
	eq(
		"a key another device deleted stays deleted",
		save({ name: "Sam", groups: ["[[Run club]]"] }, loaded, { ...loaded, name: "Samuel" }),
		{ name: "Samuel", groups: ["[[Run club]]"] }
	);
	ok(
		"a failed read (nothing loaded, nothing in memory) writes nothing",
		isEmptyPatch(frontmatterPatch({}, {}))
	);

	// ---------- lists edited in place ----------
	{
		const data = { name: "Sam", interests: ["Tea"] };
		const before = snapshotFrontmatter(data);
		data.interests.push("Jazz");
		eq(
			"a list edited in place is seen as changed",
			frontmatterPatch(before, snapshotFrontmatter(data)),
			{ set: { interests: ["Tea", "Jazz"] }, remove: [] }
		);
		eq("...because the snapshot is a copy", before.interests, ["Tea"]);
	}

	// ---------- the file keeps its shape ----------
	{
		const fm = { a: 1, b: 2, c: 3 };
		applyFrontmatterPatch(fm, { set: { b: 20, d: 4 }, remove: ["c"] });
		eq("existing keys keep their place; new ones go at the end", Object.keys(fm), ["a", "b", "d"]);
		eq("...with the new values", fm, { a: 1, b: 20, d: 4 });
	}
	eq(
		"a value that only looks different to === (a copied list) isn't rewritten",
		frontmatterPatch({ members: ["[[A]]"] }, { members: ["[[A]]"] }),
		{ set: {}, remove: [] }
	);

	return result();
}
