import { createSuite } from "./harness.mjs";
import { createTestVault } from "./vault.mjs";
import {
	buildYearRecap,
	formatMoney,
	normalizeUrl,
	resolvePeopleInfo,
	startsWithEmoji,
	timelineOf,
} from "./.build/callander.mjs";

/** Text, link and money bugs from the review (§5.2). */
export async function run() {
	const { eq, result } = createSuite("text bugs");

	eq("a share that rounds to nothing isn't minus nothing (UB-B2)", [formatMoney(-0.0033), formatMoney(-0.005), formatMoney(-1.5), formatMoney(12.005)], ["$0.00", "−$0.01", "−$1.50", "$12.01"]);

	eq(
		"mailto, tel and sms are left alone; hosts with ports are still sites (UA-B7)",
		["mailto:a@b.com", "tel:+61400000000", "sms:+614", "https://x.com", "example.com", "localhost:3000"].map(normalizeUrl),
		["mailto:a@b.com", "tel:+61400000000", "sms:+614", "https://x.com", "https://example.com", "https://localhost:3000"]
	);

	eq("a flag or keycap already leads with an emoji (UB-B10)", ["🇯🇵 Tokyo", "1️⃣ first", "🎉 party", "Tokyo"].map(startsWithEmoji), [true, true, true, false]);

	eq(
		"an unknown travel type shows the fallback, not undefined (UB-B9)",
		timelineOf({ travel: [{ text: "Hover to island", type: "hovercraft", date: "2026-08-10" }] }).map((e) => e.emoji),
		["🧭"]
	);

	// UA-B6: an aliased link resolves to its note.
	{
		const t = await createTestVault();
		const riley = await t.addPerson("Riley Sorensen");
		const plan = await t.addPlan("Trip");
		const info = resolvePeopleInfo(t.app, plan.path, ["[[Riley Sorensen|Riley]]", "[[Nobody|Guest]]", "[[Ann]]"]);
		eq("an alias resolves to its note; an unresolved one shows its alias (UA-B6)", info.map((p) => p.displayName), ["Riley Sorensen", "Guest", "Ann"]);
		void riley;
	}

	// SVC-B7: deleting a person takes aliased and space-padded entries too.
	{
		const t = await createTestVault();
		const sam = await t.addPerson("Sam Rivera");
		const plan = await t.addPlan("Cabin", { members: ["[[Sam Rivera|Sam]]", " [[Sam Rivera]] ", "Guest"], unconfirmedMembers: ["[[Sam Rivera|S]]"] });
		await t.plans.removePersonFromPlans(sam);
		eq("aliased members go too (SVC-B7)", [t.frontmatterOf(plan).members, t.frontmatterOf(plan).unconfirmedMembers], [["Guest"], undefined]);
	}

	// CORE-B6, CORE-B7, and the plural slips.
	const shared = { file: { path: "Events/Hangout.md" }, date: "2026-04-01", type: "hangout", status: "open" };
	const cancelled = { file: { path: "Events/Off.md" }, date: "2026-05-01", type: "hangout", status: "cancelled" };
	const recap = buildYearRecap({
		year: 2026,
		generatedOn: "2026-12-30",
		contacts: [
			{ name: "Ann", file: { basename: "Ann Lee" }, met: "2026-03", events: [shared, cancelled], ideas: [], openIdeas: 0 },
			{ name: "Bo", file: { basename: "Bo" }, met: "", events: [shared], ideas: [], openIdeas: 0 },
		],
		diaryDates: ["2026-01-02"],
	}).split("\n");
	eq("recap links go to the file, not the name field (CORE-B6)", recap.filter((l) => l.startsWith("- [[")), ["- [[Ann Lee]]", "- [[Ann Lee]] — 1 event", "- [[Bo]] — 1 event"]);
	eq("a shared event counts once, a cancelled one not at all (CORE-B7)", recap.find((l) => l.startsWith("**")), "**1 event across everyone** — 1 hangout, 0 of their life moments witnessed.");
	eq("one diary entry is an entry (CORE-B8)", recap.find((l) => l.includes("about 2026")), "- 1 entry about 2026");
	return result();
}
