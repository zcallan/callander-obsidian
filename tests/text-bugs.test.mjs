import { createSuite } from "./harness.mjs";
import { createTestVault } from "./vault.mjs";
import {
	Notice,
	birthdayCalendar,
	joinFrontmatter,
	locateEntry,
	splitFrontmatter,
	buildYearRecap,
	expensesOf,
	formatItemCost,
	formatMoney,
	normalizeTimezone,
	owedFor,
	parseCsv,
	truncate,
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
		const rowan = await t.addPerson("Rowan Sandberg");
		const plan = await t.addPlan("Trip");
		const info = resolvePeopleInfo(t.app, plan.path, ["[[Rowan Sandberg|Rowan]]", "[[Nobody|Guest]]", "[[Ann]]"]);
		eq("an alias resolves to its note; an unresolved one shows its alias (UA-B6)", info.map((p) => p.displayName), ["Rowan Sandberg", "Guest", "Ann"]);
		void rowan;
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

	// ---------- the rest of §5.2's text, money and import bugs ----------
	eq("a cut never lands between an emoji's halves (UA-B10)", [truncate("ab😀cd", 3), truncate("abcdef", 3), truncate("ab", 3)], ["ab…", "abc…", "ab"]);

	eq("a zone is stored as Intl spells it (UA-B11)", [normalizeTimezone("europe/madrid"), normalizeTimezone("Europe/Madrid"), normalizeTimezone("not/a_zone")], ["Europe/Madrid", "Europe/Madrid", null]);

	const [quoted] = expensesOf({ costs: [{ label: "Dinner", amount: 50, split: { mode: "value", shares: { Rowan: "25", Hamid: "25", Bad: "x" } } }] });
	eq("quoted shares read as numbers, and junk is left out (UB-B4)", quoted.split.shares, { Rowan: 25, Hamid: 25 });
	eq("…so each owes their $25, not \"2510\"", owedFor(quoted, ["Rowan", "Hamid"]).Rowan, 25);

	eq("a cost reads the same everywhere it's shared (UB-B14)", [formatItemCost(0), formatItemCost(12), formatItemCost(12.5), formatItemCost(12.345)], ["Free", "$12", "$12.50", "$12.35"]);

	eq(
		"a CR inside a quoted cell isn't kept (UB-B15)",
		parseCsv('name,notes\r\nPizza,"line one\r\nline two"\r\n').map((r) => r.cells),
		[["name", "notes"], ["Pizza", "line one\nline two"]]
	);

	const uidsOf = (names) => birthdayCalendar(names.map((n) => ({ basename: n, displayName: n, birthday: "1990-05-01" })), new Date(2026, 0, 1)).ics.split("\r\n").filter((l) => l.startsWith("UID:"));
	const cjk = uidsOf(["李雷", "王芳"]);
	const accents = uidsOf(["Zoë", "Zoé"]);
	eq("non-Latin and near-identical names get distinct UIDs (CORE-B5)", [cjk[0] !== cjk[1], accents[0] !== accents[1]], [true, true]);
	eq("…and a UID that already worked is unchanged", uidsOf(["Ana Lee"]), ["UID:callander-ana-lee-2026@callander"]);
	eq("…and stable from one export to the next", uidsOf(["李雷", "王芳"]), cjk);

	// CORE-B11: the missing People folder, said once, and never before setup.
	{
		const t = await createTestVault();
		await t.app.fileManager.trashFile(t.vault.getFolderByPath("Friends/People"));
		Notice.all.length = 0;
		await t.contacts.getContacts();
		await t.contacts.getContacts();
		eq("a missing People folder is said once, not on every read (CORE-B11)", Notice.all.filter((m) => String(m).includes("People folder")).length, 1);
		// No base folder at all: a fresh install, before the dashboard's
		// first open has made the folders.
		const fresh = await createTestVault();
		await fresh.app.fileManager.trashFile(fresh.vault.getFolderByPath("Friends/People"));
		await fresh.app.fileManager.trashFile(fresh.vault.getFolderByPath("Friends/Plans"));
		await fresh.app.fileManager.trashFile(fresh.vault.getFolderByPath("Friends"));
		Notice.all.length = 0;
		await fresh.contacts.getContacts();
		eq("…and not at all before the vault is set up", Notice.all.length, 0);
	}

	// CP-B15: a note with CRLF line endings.
	const crlf = "---\r\nname: Ana\r\nrelationship: friend\r\n---\r\n## Notes\r\n\r\nHi.\r\n";
	const split = splitFrontmatter(crlf);
	eq("CRLF frontmatter is found (CP-B15)", split.frontmatter, "name: Ana\nrelationship: friend");
	eq("…and joined back as LF", joinFrontmatter(split.frontmatter, split.body), "---\nname: Ana\nrelationship: friend\n---\n## Notes\n\nHi.\n");

	// IMPL-2: a credit found by what it held, when the list moved under it.
	const credits = [{ person: "Bo", amount: 5 }, { person: "Ana", amount: 20 }];
	eq(
		"a credit is found where it moved to, or not at all (IMPL-2)",
		[locateEntry(credits, 1, { person: "Ana", amount: 20 }), locateEntry(credits, 0, { person: "Ana", amount: 20 }), locateEntry(credits, 0, { person: "Cy", amount: 1 })],
		[1, 1, -1]
	);
	return result();
}
