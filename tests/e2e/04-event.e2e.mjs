import { createSuite } from "../harness.mjs";

/**
 * Adding an event from the dashboard, through the real modal.
 *
 * Unlike the other e2e files this one drives the actual form — typing into
 * the inputs, clicking the type button, clicking Save — rather than calling
 * the service directly. That's the point: the fields most likely to break
 * are the ones with a control between the user and the stored value.
 *
 * Type is a row of emoji buttons that mutate modal state on click, and Date
 * is a precision dropdown that *replaces* its own input element when
 * switched. Neither is exercised by calling `createEvent()` with a plain
 * object, so both could be wired wrong while every other tier stays green.
 *
 * Then it checks the row the dashboard actually renders, because "saved
 * correctly" and "shown correctly" are separate failures.
 */
export async function run({ cdp }) {
	const { eq, ok, result } = createSuite("add event (real modal)");

	// Ten days out: comfortably inside the default 30-day Upcoming window,
	// so the row renders inline rather than behind "Show all". Computed
	// from today rather than hardcoded, or the test would silently stop
	// checking the dashboard once the date drifted out of the window.
	const target = new Date();
	target.setDate(target.getDate() + 10);
	const pad = (n) => String(n).padStart(2, "0");
	const DATE = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(
		target.getDate()
	)}`;
	const expected = {
		weekday: target.toLocaleDateString("en-AU", { weekday: "long" }),
		day: String(target.getDate()),
		monthFull: target.toLocaleDateString("en-AU", { month: "long" }),
	};
	expected.monthShort = expected.monthFull.slice(0, 3);
	// Ten days out lands in the dashboard's second week, where a date reads
	// as "Next Thursday" rather than "Thursday 13 Aug". Inside a week it
	// would be the bare weekday, and from a fortnight the calendar date.
	expected.nearLabel = `Next ${expected.weekday}`;
	const TIME = "19:30";
	const NAME = "Houndmouth at the Sinclair";
	const LOCATION = "Cambridge, MA";
	const LINK = "https://example.com/tickets";

	// ---------- open the modal by clicking the dashboard's own button ----------
	const clicked = await cdp.evaluate(async () => {
		await window.app.plugins.plugins.callander.activateDashboard();
		const btn = [...document.querySelectorAll("button")].find((b) =>
			/add event/i.test(b.textContent ?? "")
		);
		if (!btn) return false;
		btn.click();
		return true;
	});
	eq("the dashboard has an Add event button", clicked, true);

	// Waited for rather than slept on — a fixed delay was occasionally too
	// short here, which surfaced as a confusing "input not found" further down.
	const title = await cdp.waitFor(
		() =>
			document.querySelector(".modal-container")?.querySelector("h2")
				?.textContent ?? false,
		{ timeoutMs: 10000, label: "the event modal to open" }
	);
	eq("it is the create form, not the edit form", title, "Add event");

	// ---------- fill every field ----------
	const filled = await cdp.evaluate(
		async (name, date, time, location, link) => {
			const modal = document.querySelector(".modal-container");
			const q = (sel) => [...modal.querySelectorAll(sel)];
			// Inputs fire on real events, so dispatch them rather than just
			// assigning — assigning alone would leave the modal's own state
			// untouched and the test would pass against broken wiring.
			const set = (el, value, event = "input") => {
				el.value = value;
				el.dispatchEvent(new Event(event, { bubbles: true }));
			};

			const nameInput = q(".callander-modal-input")[0];
			set(nameInput, name);

			// Type: click the Concert button by its label.
			const typeBtn = q(".quick-idea-categories button").find((b) =>
				/concert/i.test(b.getAttribute("aria-label") ?? "")
			);
			if (!typeBtn) return { ok: false, reason: "no Concert type button" };
			typeBtn.click();

			// Date: switch the precision dropdown to "Exact day" first — that
			// swaps in a fresh <input type=date>, so it must be re-queried.
			const precision = modal.querySelector(".contact-met-precision");
			set(precision, "day", "change");
			await new Promise((r) => setTimeout(r, 50));
			const dateInput = modal.querySelector(".contact-met-input");
			set(dateInput, date, "change");

			// Time is a pair of dropdowns — hour, then minutes in steps of
			// five — rather than an <input type=time>. The singular
			// aria-labels are this field; the Duration control below it uses
			// the plural "Hours"/"Minutes", and an exact attribute match is
			// what keeps the two apart.
			const [hh, mm] = time.split(":");
			const hourSelect = modal.querySelector('select[aria-label="Hour"]');
			const minuteSelect = modal.querySelector(
				'select[aria-label="Minute"]'
			);
			set(hourSelect, String(Number(hh)), "change");
			set(minuteSelect, String(Number(mm)), "change");

			// Location and Link are the remaining plain text inputs.
			const textInputs = q('.callander-modal-input[type="text"]');
			set(textInputs[textInputs.length - 2], location);
			set(textInputs[textInputs.length - 1], link);

			return {
				ok: true,
				typeSelected: typeBtn.classList.contains("selected"),
				dateInputType: dateInput?.type,
				dateInputValue: dateInput?.value,
				timeValue: `${hourSelect?.value}:${minuteSelect?.value}`,
			};
		},
		NAME,
		DATE,
		TIME,
		LOCATION,
		LINK
	);
	eq("all fields were reachable", filled.ok, true);
	eq("the Concert type button became selected", filled.typeSelected, true);
	eq("choosing 'Exact day' swaps in a date input", filled.dateInputType, "date");
	eq("the date input holds the chosen day", filled.dateInputValue, DATE);
	eq("the time dropdowns hold the chosen time", filled.timeValue, TIME);

	// ---------- save ----------
	await cdp.evaluate(() => {
		const modal = document.querySelector(".modal-container");
		const save = [...modal.querySelectorAll("button")].find(
			(b) => (b.textContent ?? "").trim() === "Save"
		);
		save.click();
	});

	// The modal's submit awaits createEvent(), then onChange() — which is the
	// dashboard's refresh() — and only then closes. So the moment the modal
	// disappears, the row on screen is exactly what the user is looking at.
	await cdp.waitFor(() => !document.querySelector(".modal-container"), {
		timeoutMs: 10000,
		label: "the event modal to close",
	});

	// Snapshot immediately: no sleep, no extra refresh, no polling. Anything
	// that gives the metadata cache extra time to catch up here would hide
	// precisely the staleness this guards against.
	const immediate = await cdp.evaluate((expectedName) => {
		const rows = [...document.querySelectorAll(".dashboard-upcoming-row")];
		const match = rows.find((el) =>
			(el.textContent ?? "").includes(expectedName)
		);
		return {
			found: !!match,
			when: match?.querySelector(".dashboard-upcoming-when")?.textContent ?? "",
			name: match?.querySelector(".dashboard-upcoming-name")?.textContent ?? "",
		};
	}, NAME);

	eq("appears on the dashboard as soon as the modal closes", immediate.found, true);
	ok(
		"…already showing its type icon, not the fallback ⏰",
		immediate.when.startsWith("🎸")
	);
	ok(
		"…already showing its date, not 'Anytime'",
		immediate.when.includes(expected.nearLabel) &&
			!immediate.when.includes("Anytime")
	);
	ok("…already showing its time", immediate.when.includes("7:30 PM"));

	// The file is created and then rewritten via processFrontMatter, so wait
	// for the cache rather than assuming the second write has landed.
	const saved = await cdp.waitFor(
		(expectedName) => {
			const ops = window.app.plugins.plugins.callander.eventOperations;
			const r = ops.getEvents().find((x) => x.name === expectedName);
			if (!r) return false;
			// Picked field by field: an EventInfo carries its TFile, which has
			// circular parent/children references and can't be serialised.
			return {
				name: r.name,
				type: r.type,
				date: r.date,
				time: r.time,
				location: r.location,
				link: r.link,
				status: r.status,
				created: r.created,
				updated: r.updated,
				path: r.file?.path,
			};
		},
		{ timeoutMs: 10000, label: "the saved event", args: [NAME] }
	);

	// ---------- every field round-tripped ----------
	eq("name saved", saved.name, NAME);
	eq("type saved as the id, not the label or emoji", saved.type, "concert");
	eq("date saved as an ISO day", saved.date, DATE);
	eq("time saved in 24h form", saved.time, TIME);
	eq("location saved", saved.location, LOCATION);
	eq("link saved", saved.link, LINK);
	eq("status defaults to open", saved.status, "open");
	ok("created stamp written", /^\d{4}-\d{2}-\d{2}$/.test(saved.created ?? ""));
	ok("updated stamp written", /^\d{4}-\d{2}-\d{2}$/.test(saved.updated ?? ""));

	// ---------- the file on disk ----------
	const raw = await cdp.evaluate(async (expectedName) => {
		const ops = window.app.plugins.plugins.callander.eventOperations;
		const r = ops.getEvents().find((x) => x.name === expectedName);
		return {
			path: r?.file?.path,
			content: r?.file ? await window.app.vault.read(r.file) : null,
		};
	}, NAME);
	ok(
		"stored as its own file under Events/",
		raw.path?.startsWith("Friends/Events/")
	);
	ok("marked as an event note", raw.content?.includes("kind: event"));
	ok("type persisted to frontmatter", /^type: concert$/m.test(raw.content ?? ""));
	ok("date persisted to frontmatter", raw.content?.includes(`date: ${DATE}`));
	// Times must stay quoted, or YAML reads 19:30 as a sexagesimal number.
	ok(
		"time persisted without being mangled by YAML",
		/^time: ["']?19:30["']?$/m.test(raw.content ?? "")
	);

	// ---------- how it appears on the dashboard ----------
	const row = await cdp.evaluate(async (expectedName) => {
		const plugin = window.app.plugins.plugins.callander;
		await plugin.activateDashboard();
		const view = window.app.workspace
			.getLeavesOfType("callander-dashboard")
			.at(0)?.view;
		await view?.refresh();
		await new Promise((r) => setTimeout(r, 300));

		const rows = [...document.querySelectorAll(".dashboard-upcoming-row")];
		const match = rows.find((el) =>
			(el.textContent ?? "").includes(expectedName)
		);
		if (!match) {
			return {
				found: false,
				allRows: rows.map((r) => (r.textContent ?? "").slice(0, 80)),
			};
		}
		return {
			found: true,
			when: match.querySelector(".dashboard-upcoming-when")?.textContent ?? "",
			name: match.querySelector(".dashboard-upcoming-name")?.textContent ?? "",
			relative:
				match.querySelector('[class*="dashboard-rel-"]')?.textContent ??
				match.querySelector(".dashboard-upcoming-relative")?.textContent ??
				"",
		};
	}, NAME);

	eq("the event appears in Upcoming", row.found, true);
	if (row.found) {
		// Type drives the row's icon — the only place the choice is visible.
		ok("row leads with the Concert emoji 🎸", row.when.startsWith("🎸"));
		ok(
			`row says "${expected.nearLabel}"`,
			row.when.includes(expected.nearLabel)
		);
		// The date rides along with the weekday rather than being replaced
		// by it: naming the day conversationally was meant to save the
		// reader doing the arithmetic, not to hide which date it lands on.
		// See conversationalLabel.
		ok(
			"row keeps the short date alongside the weekday",
			row.when.includes(`${expected.day} ${expected.monthShort}`)
		);
		// 12-hour display, separated from the date by a bullet.
		ok("row shows the time in 12-hour form", row.when.includes("7:30 PM"));
		ok("time is separated from the date", row.when.includes(" · "));
		ok("row shows the event name", row.name.includes(NAME));
		ok("row shows the location", row.name.includes(LOCATION));
	} else {
		ok(`rows present were: ${JSON.stringify(row.allRows)}`, false);
	}

	// ---------- clean up ----------
	await cdp.evaluate(async (expectedName) => {
		const ops = window.app.plugins.plugins.callander.eventOperations;
		const r = ops.getEvents().find((x) => x.name === expectedName);
		if (r?.file) await window.app.vault.delete(r.file);
	}, NAME);
	const gone = await cdp.evaluate(
		(expectedName) =>
			!window.app.plugins.plugins.callander.eventOperations
				.getEvents()
				.some((r) => r.name === expectedName),
		NAME
	);
	eq("test event cleaned up", gone, true);

	return result();
}
