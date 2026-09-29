import { createSuite } from "./harness.mjs";
import { createTestVault } from "./vault.mjs";
import { Notice, queuedFlight, singleFlight } from "./.build/callander.mjs";

/** singleFlight, queuedFlight, the migration's count, and the services' path checks. */
export async function run() {
	const { eq, ok, result } = createSuite("service plumbing");

	// ---------- singleFlight ----------
	{
		let started = 0;
		let release;
		const once = singleFlight(() => {
			started++;
			return new Promise((resolve) => (release = resolve));
		});
		const a = once();
		const b = once();
		ok("a call mid-run joins it", a === b && started === 1);
		release(7);
		eq("…and both see its result", [await a, await b], [7, 7]);
		const c = once();
		ok("after it settles, the next call starts afresh", c !== a && started === 2);
		release(8);
		await c;

		const failing = singleFlight(async () => {
			started++;
			throw new Error("no");
		});
		let caught = 0;
		await failing().catch(() => caught++);
		await failing().catch(() => caught++);
		eq("a failed run doesn't stick", [caught, started], [2, 4]);
	}

	// ---------- queuedFlight ----------
	{
		// A page refresh: reads, then draws what it read. Each run reports
		// the version of the data it saw.
		let version = 1;
		const drawn = [];
		const releases = [];
		const refresh = queuedFlight(async () => {
			const seen = version;
			await new Promise((resolve) => releases.push(resolve));
			drawn.push(seen);
		});
		const first = refresh();
		version = 2; // a change lands while the first run is reading
		const second = refresh();
		const third = refresh();
		ok("calls mid-run share one promise", second === third);
		releases.shift()();
		await Promise.resolve();
		await Promise.resolve();
		eq("one more run follows, however many asked", releases.length, 1);
		releases.shift()();
		await Promise.all([first, second, third]);
		eq("and it saw the change that landed mid-read", drawn, [1, 2]);
		const fourth = refresh();
		releases.shift()();
		await fourth;
		eq("once idle, a call starts a run of its own", drawn, [1, 2, 2]);

		let failures = 0;
		const failing = queuedFlight(async () => {
			failures++;
			throw new Error("no");
		});
		await failing().catch(() => undefined);
		await failing().catch(() => undefined);
		eq("a failed run doesn't block the next", failures, 2);

		// A run that fails while another call is waiting on it.
		let runs = 0;
		let let_go;
		const flaky = queuedFlight(async () => {
			runs++;
			await new Promise((resolve) => (let_go = resolve));
			if (runs === 1) throw new Error("read failed");
		});
		const failed = flaky();
		const waiting = flaky();
		let_go();
		await failed.catch(() => undefined);
		await waiting.catch(() => undefined);
		const after = flaky();
		ok("a failure mid-queue doesn't wedge it", after !== failed);
		let_go();
		await after;
		eq("the next call runs afresh", runs, 2);
	}

	// ---------- the migration says how much it moved ----------
	{
		const t = await createTestVault();
		await t.addPerson("Ada", { events: [{ date: "2026-01-01", text: "Skating" }, { date: "2026-02-01", text: "Gallery" }] });
		const [first, joined] = await Promise.all([t.migration.run(), t.migration.run()]);
		eq("two events moved, and a concurrent call joined the same run", [first, joined], [2, 2]);
		eq("a second run moves nothing", await t.migration.run(), 0);
		eq("…and no notice from the service itself: main.ts shows it", Notice.all, []);
	}

	// ---------- person and group paths ----------
	{
		const t = await createTestVault();
		eq(
			"by folder alone",
			["Friends/People/Ada.md", "Friends/People/sub/B.md", "Friends/Groups/Run club.md", "Friends/PeopleX/A.md", "Friends/GroupsX/A.md", "Friends/Dashboard.md"].map((p) => [t.contacts.isPersonFile(p), t.contacts.isGroupFile(p)]),
			[[true, false], [true, false], [false, true], [false, false], [false, false], [false, false]]
		);
	}
	return result();
}
