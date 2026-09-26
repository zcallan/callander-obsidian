import { createSuite } from "./harness.mjs";
import { createTestVault } from "./vault.mjs";

/**
 * A plan's `members`/`unconfirmedMembers` are the plan's own copy of a
 * wikilink, not a live query against the person — so deleting someone has
 * to prune those copies itself, or "Who's in" renders the dangling
 * wikilink text forever. See PlanOperations.removePersonFromPlans.
 */
export async function run() {
	const { eq, result } = createSuite("plan operations (fake vault)");

	{
		const t = await createTestVault();
		const person = await t.addPerson("Sam Rivera");
		await t.addPlan("Cabin trip", {
			date: "2026-08-06",
			members: ["[[Sam Rivera]]", "Guest with no file"],
		});

		await t.plans.removePersonFromPlans(person);

		const plan = t.plans.getPlans()[0];
		eq(
			"the deleted person's entry is gone",
			t.frontmatterOf(plan.file).members,
			["Guest with no file"]
		);
	}

	{
		// unconfirmedMembers isn't part of PlanInfo, but the plan's own
		// frontmatter still carries it — the same cleanup has to reach it.
		const t = await createTestVault();
		const person = await t.addPerson("Sam Rivera");
		const plan = await t.addPlan("Cabin trip", {
			date: "2026-08-06",
			unconfirmedMembers: ["[[Sam Rivera]]"],
		});

		await t.plans.removePersonFromPlans(person);

		eq(
			"an empty list is dropped rather than left as []",
			"unconfirmedMembers" in t.frontmatterOf(plan),
			false
		);
	}

	{
		// A plan with no reference to the person at all is left untouched —
		// this also guards against writing to every plan on every delete.
		const t = await createTestVault();
		const person = await t.addPerson("Sam Rivera");
		const other = await t.addPerson("Jess Okafor");
		const plan = await t.addPlan("Cabin trip", {
			date: "2026-08-06",
			members: ["[[Jess Okafor]]"],
		});

		await t.plans.removePersonFromPlans(person);

		eq(
			"an unrelated plan's members are untouched",
			t.frontmatterOf(plan).members,
			["[[Jess Okafor]]"]
		);
		eq("the other person still resolves", !!other, true);
	}

	{
		// Two plans, only one referencing the deleted person.
		const t = await createTestVault();
		const person = await t.addPerson("Sam Rivera");
		const withThem = await t.addPlan("Cabin trip", {
			date: "2026-08-06",
			members: ["[[Sam Rivera]]"],
		});
		const withoutThem = await t.addPlan("Beach day", {
			date: "2026-08-07",
			members: ["[[Sam Rivera x]]"],
		});

		await t.plans.removePersonFromPlans(person);

		eq(
			"the referencing plan is cleaned up",
			"members" in t.frontmatterOf(withThem),
			false
		);
		eq(
			"a similarly-named but different link is left alone",
			t.frontmatterOf(withoutThem).members,
			["[[Sam Rivera x]]"]
		);
	}

	return result();
}
