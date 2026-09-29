import { createSuite } from "./harness.mjs";
import { createTestVault } from "./vault.mjs";
import { Notice, singleFlight } from "./.build/callander.mjs";

/** singleFlight, the migration's count, and the services' path checks. */
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
