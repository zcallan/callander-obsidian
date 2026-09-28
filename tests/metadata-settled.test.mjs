import { createSuite } from "./harness.mjs";
import { metadataSettled } from "./.build/callander.mjs";

/** A cache the test drives by hand: frontmatter per path, and "changed". */
function fakeApp() {
	const frontmatter = new Map();
	const listeners = new Set();
	let removed = 0;
	return {
		vault: {
			getAbstractFileByPath: (path) => (frontmatter.has(path) ? { path } : null),
		},
		metadataCache: {
			getCache: (path) => ({ frontmatter: frontmatter.get(path) }),
			on(_name, cb) {
				listeners.add(cb);
				return cb;
			},
			offref(ref) {
				if (listeners.delete(ref)) removed++;
			},
		},
		/** Write a file's frontmatter, with the index event or without it. */
		set(path, fm, { announce = true } = {}) {
			frontmatter.set(path, fm);
			if (announce) for (const cb of [...listeners]) cb({ path });
		},
		listening: () => listeners.size,
		removed: () => removed,
	};
}

/** Whether a promise settles within `ms`: a wait that should end on an
 * event must not only be ending on its much longer timeout. */
function settlesWithin(promise, ms) {
	return Promise.race([
		promise.then(() => true),
		new Promise((resolve) => setTimeout(() => resolve(false), ms)),
	]);
}

/**
 * The wait every write here relies on before reading the cache back. It has
 * to end on the right change and no other, and it must never hang: a write
 * that changes nothing emits no event at all.
 */
export async function run() {
	const { eq, ok, result } = createSuite("metadata settled");
	const LONG = { timeoutMs: 10_000 };
	const QUICK = 500;

	{
		const app = fakeApp();
		app.set("a.md", { status: "done" });
		const wait = metadataSettled(app, "a.md", { ...LONG, until: (fm) => fm?.status === "done" });
		// Sooner than the 25 ms poll could manage: this is the immediate check.
		ok("already as expected: done at once", await settlesWithin(wait, 10));
		eq("…and it stops listening", [app.listening(), app.removed()], [0, 1]);
	}
	{
		const app = fakeApp();
		app.set("a.md", { status: "open" });
		const wait = metadataSettled(app, "a.md", { ...LONG, until: (fm) => fm?.status === "done" });
		app.set("b.md", { status: "done" });
		app.set("a.md", { status: "open", touched: true });
		ok("another file's change, or the wrong value, isn't enough", !(await settlesWithin(wait, 60)));
		app.set("a.md", { status: "done" });
		ok("…the right value on the right file is", await settlesWithin(wait, QUICK));
	}
	{
		const app = fakeApp();
		app.set("a.md", { status: "open" });
		const wait = metadataSettled(app, "a.md", { ...LONG, until: (fm) => fm?.status === "done" });
		app.set("a.md", { status: "done" }, { announce: false });
		ok("an index that finished with no event is found by polling", await settlesWithin(wait, QUICK));
	}
	{
		const app = fakeApp();
		app.set("a.md", {});
		const wait = metadataSettled(app, "a.md", LONG);
		app.set("b.md", {});
		ok("without a condition, another file's change isn't enough", !(await settlesWithin(wait, 60)));
		app.set("a.md", {});
		ok("…any change to this one is", await settlesWithin(wait, QUICK));
	}
	{
		const app = fakeApp();
		app.set("a.md", {});
		const wait = metadataSettled(app, "a.md", { timeoutMs: 30, until: () => false });
		ok("a change that never comes times out instead of hanging", await settlesWithin(wait, QUICK));
		eq("…and it stops listening then too", app.listening(), 0);
	}

	return result();
}
