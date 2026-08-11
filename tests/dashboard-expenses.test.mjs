import { createSuite } from "./harness.mjs";
import { createTestVault } from "./vault.mjs";

/**
 * Ad-hoc expenses persisting to the dashboard file's frontmatter. This is
 * the tier that catches "looked right on screen, never reached the file" —
 * the reads and writes go through the real processFrontMatter path.
 */
export async function run() {
	const { eq, ok, result } = createSuite("dashboard expenses (fake vault)");

	const expense = (over = {}) => ({
		label: "Dinner",
		amount: 60,
		split: { mode: "even" },
		...over,
	});

	// ---------- nothing there yet ----------
	{
		const t = await createTestVault();
		eq(
			"no dashboard file reads as no expenses",
			await t.contacts.getExpenses(),
			[]
		);
	}

	// ---------- the first write creates the file it needs ----------
	{
		const t = await createTestVault();
		const path = t.contacts.getDashboardFilePath();
		ok(
			"no dashboard file to begin with",
			!t.app.vault.getAbstractFileByPath(path)
		);
		await t.contacts.writeExpenses((list) => list.push(expense()));
		ok(
			"writing one creates the dashboard file",
			!!t.app.vault.getAbstractFileByPath(path)
		);
		const saved = await t.contacts.getExpenses();
		eq("...and the expense is there", saved.length, 1);
		eq("...with its label", saved[0]?.label, "Dinner");
		eq("...and its amount", saved[0]?.amount, 60);
	}

	// ---------- round trips ----------
	{
		const t = await createTestVault();
		await t.contacts.writeExpenses((list) =>
			list.push(
				expense({
					people: ["[[Riley Sorensen]]", "Sam from work"],
					paid: ["Callan"],
					split: {
						mode: "receipt",
						shares: { Callan: 20, "Sam from work": 40 },
						exprs: { Callan: "10+10" },
						tax: 6.25,
						tip: 20,
					},
				})
			)
		);
		const saved = (await t.contacts.getExpenses())[0] ?? {};
		const split = saved.split ?? {};
		eq("people survive the file", saved.people, [
			"[[Riley Sorensen]]",
			"Sam from work",
		]);
		eq("the paid list survives", saved.paid, ["Callan"]);
		eq("the split mode survives", split.mode, "receipt");
		eq("shares survive", split.shares, {
			Callan: 20,
			"Sam from work": 40,
		});
		eq("the typed working survives", split.exprs, {
			Callan: "10+10",
		});
		eq("tax survives", split.tax, 6.25);
		eq("tip survives", split.tip, 20);
	}

	// An explicitly empty paid list is "marked unsettled", which has to read
	// back differently from an expense nobody has touched.
	{
		const t = await createTestVault();
		await t.contacts.writeExpenses((list) => {
			list.push(expense({ label: "Cleared", paid: [] }));
			list.push(expense({ label: "Untouched" }));
		});
		const saved = await t.contacts.getExpenses();
		eq("an empty paid list comes back empty", saved[0]?.paid, []);
		eq(
			"an untouched expense has no paid key at all",
			"paid" in (saved[1] ?? {}),
			false
		);
	}

	// ---------- editing and removing ----------
	{
		const t = await createTestVault();
		await t.contacts.writeExpenses((list) => {
			list.push(expense({ label: "A" }));
			list.push(expense({ label: "B" }));
		});
		await t.contacts.writeExpenses((list) => {
			list[1].settled = true;
		});
		const saved = await t.contacts.getExpenses();
		eq("editing by index hits the right one", saved[1]?.settled, true);
		eq(
			"...and leaves the other alone",
			"settled" in (saved[0] ?? {}),
			false
		);

		await t.contacts.writeExpenses((list) => list.splice(0, 1));
		const afterDelete = await t.contacts.getExpenses();
		eq("deleting removes just that one", afterDelete.length, 1);
		eq("...the right one", afterDelete[0]?.label, "B");
	}

	// Emptying the list drops the key rather than leaving `expenses: []`
	// sitting in a note you might actually open.
	{
		const t = await createTestVault();
		await t.contacts.writeExpenses((list) => list.push(expense()));
		await t.contacts.writeExpenses((list) => list.splice(0, 1));
		const file = t.app.vault.getAbstractFileByPath(
			t.contacts.getDashboardFilePath()
		);
		eq(
			"the last expense takes the key with it",
			"expenses" in t.frontmatterOf(file),
			false
		);
		eq("...and reads back as empty", await t.contacts.getExpenses(), []);
	}

	// ---------- kept apart from a plan's own costs ----------
	{
		const t = await createTestVault();
		await t.contacts.writeExpenses((list) => list.push(expense()));
		const file = t.app.vault.getAbstractFileByPath(
			t.contacts.getDashboardFilePath()
		);
		const fm = t.frontmatterOf(file);
		ok("stored under `expenses`", Array.isArray(fm.expenses));
		eq("not under `costs`, which is a plan's key", "costs" in fm, false);
	}

	return result();
}
