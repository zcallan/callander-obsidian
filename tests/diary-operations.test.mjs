import { createSuite } from "./harness.mjs";
import { createTestVault } from "./vault.mjs";

/**
 * The diary service, pinned before it's reorganised: entries are files named
 * by date and title, listed newest first, renamed to follow an edit, and
 * trashed rather than deleted.
 */
export async function run() {
	const { eq, ok, result } = createSuite("diary (fake vault)");

	{
		const t = await createTestVault();
		const d = t.diary;
		await d.createEntry("Older", "2026-07-01");
		const first = await d.createEntry("Newer", "2026-08-01");
		await t.app.fileManager.processFrontMatter(first, (fm) => {
			fm.created = "2026-08-01";
		});
		const second = await d.createEntry("Same day, made later", "2026-08-01");
		await t.app.fileManager.processFrontMatter(second, (fm) => {
			fm.created = "2026-08-02";
		});
		await t.vault.create("Diary/No title.md", "---\ndate: 2026-06-01\n---\nBody text");

		const entries = await d.getEntries();
		eq(
			"newest first by date, then by when made",
			entries.map((e) => e.title),
			["Same day, made later", "Newer", "Older", "No title"]
		);
		eq("an entry with no title takes its file name", entries[3].title, "No title");
		eq("…and its body is what follows the properties", entries[3].body, "Body text");
		eq(
			"the cheap listing, from the cache, newest first",
			d.getEntriesMeta().map((e) => [e.title, e.date]),
			[
				["Newer", "2026-08-01"],
				["Same day, made later", "2026-08-01"],
				["Older", "2026-07-01"],
				["No title", "2026-06-01"],
			]
		);
	}

	{
		const t = await createTestVault();
		const d = t.diary;
		const odd = await d.createEntry('  A/B:  "notes"  ', "2026-08-04");
		eq("a title that can't be a file name is made one", odd.path, "Diary/2026-08-04 A-B- -notes-.md");
		const blank = await d.createEntry("   ", "2026-08-04");
		eq("…and a blank one is Untitled", blank.path, "Diary/2026-08-04 Untitled.md");

		const entry = await d.createEntry("Lunch", "2026-08-04");
		await d.updateMetadata(entry, "Long lunch", "2026-08-05");
		eq("an edit renames the file to match", entry.path, "Diary/2026-08-05 Long lunch.md");
		eq("…and rewrites its properties", [t.frontmatterOf(entry).title, t.frontmatterOf(entry).date], ["Long lunch", "2026-08-05"]);
		await d.updateMetadata(entry, "Long lunch", "2026-08-05");
		eq("an edit that changes neither keeps its name", entry.path, "Diary/2026-08-05 Long lunch.md");

		ok("an entry is a note in the diary folder", d.isDiaryFile(entry.path) && !d.isDiaryFile("Friends/People/Sam.md"));
		await d.deleteEntry(entry);
		ok("deleting sends it to the trash", t.app.fileManager.trashed.includes("Diary/2026-08-05 Long lunch.md"));
	}

	return result();
}
