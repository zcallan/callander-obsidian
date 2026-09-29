import { createSuite } from "./harness.mjs";
import { OwnWrites } from "./.build/callander.mjs";
import { createTestVault } from "./vault.mjs";

/**
 * The contact page reloads when its note changes on disk, and must not
 * reload on top of its own writes. It used to tell them apart by a clock
 * window, which dropped a sync landing within a second of a local save and
 * let a slow write's own event through. OwnWrites counts the writes in
 * flight instead, and remembers the mtime each one left.
 */
export function run() {
	const { eq, result } = createSuite("own writes");

	const file = (path, mtime = 1) => ({ path, stat: { mtime } });

	return (async () => {
		// --- counted while it runs ---
		{
			const own = new OwnWrites();
			const note = file("Friends/People/Ana.md");
			const other = file("Friends/People/Bo.md");
			let during = null;
			let otherDuring = null;
			await own.run(note, async () => {
				during = own.isOwn(note);
				otherDuring = own.isOwn(other);
			});
			eq("an event during the write is ours", during, true);
			eq("another file's event during it isn't", otherDuring, false);
		}

		// --- remembered by the mtime it left ---
		{
			const own = new OwnWrites();
			const note = file("Friends/People/Ana.md", 100);
			await own.run(note, async () => {
				note.stat.mtime = 200; // what the write stamps
			});
			eq("a late event for that write is still ours", own.isOwn(note), true);
			note.stat.mtime = 300; // a sync lands afterwards
			eq("a later change isn't", own.isOwn(note), false);
		}

		// --- overlapping writes to one file ---
		{
			const own = new OwnWrites();
			const note = file("Friends/Plans/Trip.md", 100);
			let release;
			const slow = own.run(note, () => new Promise((r) => (release = r)));
			await own.run(note, async () => {
				note.stat.mtime = 200;
			});
			note.stat.mtime = 250; // the slow one's own stamp, mid-flight
			eq("still ours while the other write runs", own.isOwn(note), true);
			release();
			await slow;
			note.stat.mtime = 300;
			eq("both done, a new change isn't", own.isOwn(note), false);
		}

		// --- a write that throws ---
		{
			const own = new OwnWrites();
			const note = file("Friends/People/Ana.md", 100);
			let thrown = null;
			try {
				await own.run(note, async () => {
					throw new Error("disk full");
				});
			} catch (error) {
				thrown = error.message;
			}
			eq("the failure reaches the caller", thrown, "disk full");
			note.stat.mtime = 150;
			eq("no longer counted as running", own.isOwn(note), false);
		}

		// --- against the fake vault, which fires modify inside the write ---
		{
			const t = await createTestVault();
			const ana = await t.addPerson("Ana", { relationship: "friend" });
			const own = new OwnWrites();
			const seen = [];
			t.vault.on("modify", (f) => {
				if (f.path === ana.path) seen.push(own.isOwn(f));
			});

			await own.run(ana, () =>
				t.app.fileManager.processFrontMatter(ana, (fm) => {
					fm.location = "Boston";
				})
			);
			await own.run(ana, () => t.vault.process(ana, (text) => `${text}\nMore.`));
			// A second device's write arrives.
			await t.vault.modify(ana, `${t.read(ana)}\nFrom the phone.`);

			eq(
				"frontmatter and body writes are ours; the sync isn't",
				seen,
				[true, true, false]
			);
		}

		return result();
	})();
}
