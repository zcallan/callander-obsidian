import { createSuite } from "../harness.mjs";

/**
 * A write on disk reaches the screen with no manual refresh — through the
 * real modal, and in the imperative views as well as the React ones.
 *
 * The bug this guards: every view renders from the metadata cache, but they
 * subscribed only to `vault.on("modify")`, which fires *before* that cache
 * reindexes. The refresh therefore re-read the pre-write frontmatter and
 * redrew the row it was meant to remove; the view then looked frozen until
 * some unrelated later change triggered another pass. Cancelling an event
 * left it sitting on the dashboard until a tab switch or an app reload.
 *
 * Measured in this very vault: `vault.modify` fires at ~2.4ms with the cache
 * still holding the OLD frontmatter, `setStatus` resolves at ~2.5ms still
 * stale, and `metadataCache.changed` only lands at ~3.8ms with the new value.
 * That ~1.4ms window is why a 20-file test vault usually gets away with it and
 * a large synced vault does not — the reindex scales with the vault, the
 * refresh does not wait for it.
 *
 * So the timing race itself is NOT reproducible here, and the modal walk
 * below would pass with or without the fix. The guard that actually bites is
 * `cacheOnlyRefresh`: it fires a cache event with no vault write at all, so a
 * view that never subscribed to the cache cannot possibly respond.
 */
export async function run({ cdp }) {
	const { ok, eq, result } = createSuite("live refresh (real)");

	const data = await cdp.evaluate(async () => {
		const plugin = window.app.plugins.plugins.callander;
		// Timers, not requestAnimationFrame: rAF doesn't tick while the
		// window is occluded, which an unattended run usually is.
		const tick = (ms) => new Promise((r) => setTimeout(r, ms));

		const NAME = "Live refresh probe";
		const d = new Date();
		d.setDate(d.getDate() + 3);
		const pad = (n) => String(n).padStart(2, "0");
		const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
			d.getDate()
		)}`;

		const out = {};
		let file = null;

		try {
			await plugin.eventOperations.createEvent({ name: NAME, date });
			await plugin.activateDashboard();
			await tick(700);

			const reactText = () =>
				[...document.querySelectorAll(".callander-react-root")]
					.map((h) => h.textContent)
					.join(" ");

			out.visibleBefore = reactText().includes(NAME);

			// --- drive the real modal, exactly as a user does ---
			const row = [...document.querySelectorAll(".callander-react-root *")]
				.find(
					(el) =>
						el.textContent?.includes(NAME) &&
						String(el.className || "").includes("row")
				);
			out.rowFound = !!row;
			if (!row) return out;
			row.click();
			await tick(400);

			const modal = document.querySelector(".modal-container");
			out.modalOpened = !!modal;
			if (!modal) return out;

			const cancelBtn = [...modal.querySelectorAll("button")].find((b) =>
				/^\s*Cancel\s*$/.test(b.textContent ?? "")
			);
			out.cancelFound = !!cancelBtn;
			if (!cancelBtn) return out;

			cancelBtn.click();
			await tick(900);

			out.visibleAfter = reactText().includes(NAME);
			out.modalClosed = !document.querySelector(".modal-container");

			file = plugin.eventOperations
				.getEvents()
				.find((e) => e.name === NAME)?.file;
			out.statusOnDisk =
				plugin.eventOperations.getEvents().find((e) => e.name === NAME)
					?.status ?? "(gone)";

			// --- the imperative half: the Events page is not React at all ---
			await plugin.activateEvents();
			await tick(700);
			const eventsEl = () =>
				window.app.workspace
					.getLeavesOfType("callander-events")
					.at(0)?.view?.containerEl;

			// Restore it through the service and watch the imperative view
			// notice on its own. No refresh() call anywhere here.
			const beforeRestore = eventsEl()?.textContent ?? "";
			await plugin.eventOperations.setStatus(file, "open");
			await tick(900);
			const afterRestore = eventsEl()?.textContent ?? "";

			out.eventsShowedCancelled = /Cancelled/i.test(beforeRestore);
			out.eventsClearedCancelled = !/Cancelled/i.test(afterRestore);
			out.eventsStillListsIt = afterRestore.includes(NAME);

			// --- the real guard: a cache event on its own must refresh ---
			// No vault write here, so there is no `modify` to fall back on.
			// A view that only listens to the vault cannot respond to this,
			// which is precisely the bug. Detected by dropping a sentinel
			// into the container and seeing whether the rebuild removes it —
			// `render()` empties the container, so survival means no refresh.
			out.cacheOnlyRefresh = {};
			for (const [label, type] of [
				["dashboard", "callander-dashboard"],
				["events", "callander-events"],
			]) {
				const view = window.app.workspace
					.getLeavesOfType(type)
					.at(0)?.view;
				const container = view?.containerEl?.children[1];
				if (!container) {
					out.cacheOnlyRefresh[label] = "no container";
					continue;
				}
				const sentinel = document.createElement("div");
				sentinel.dataset.sentinel = label;
				container.appendChild(sentinel);

				window.app.metadataCache.trigger("changed", file, "", {});
				await tick(500);

				out.cacheOnlyRefresh[label] = container.contains(sentinel)
					? "not refreshed"
					: "refreshed";
			}
		} finally {
			// Never leave a modal open — it blocks every later file.
			document
				.querySelectorAll(".modal-close-button")
				.forEach((b) => b.click());
			await tick(150);
			if (file) await window.app.vault.delete(file);
		}
		return out;
	});

	ok("the event renders on the dashboard first", data.visibleBefore);
	ok("its row is clickable", data.rowFound);
	ok("clicking it opens the view modal", data.modalOpened);
	ok("the modal offers Cancel", data.cancelFound);
	eq("cancelling writes the status", data.statusOnDisk, "cancelled");
	ok("the modal closes itself", data.modalClosed);
	// The report this file exists for.
	ok(
		"the row leaves the dashboard without a manual refresh",
		!data.visibleAfter
	);

	ok("the Events page shows it as cancelled", data.eventsShowedCancelled);
	ok(
		"an imperative view drops the cancelled state without a manual refresh",
		data.eventsClearedCancelled
	);
	ok("...and still lists the event", data.eventsStillListsIt);

	// The mutation-killing assertions: remove the cache subscription and
	// only these two fail. Everything above passes either way.
	eq(
		"the dashboard refreshes on a cache event alone",
		data.cacheOnlyRefresh?.dashboard,
		"refreshed"
	);
	eq(
		"the Events page refreshes on a cache event alone",
		data.cacheOnlyRefresh?.events,
		"refreshed"
	);

	return result();
}
