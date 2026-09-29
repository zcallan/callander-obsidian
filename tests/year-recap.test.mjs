import { createSuite } from "./harness.mjs";
import { buildYearRecap } from "./.build/callander.mjs";

/** The recap note's text, as main.ts wrote it before the builder moved out. */
export function run() {
	const { eq, result } = createSuite("year recap");
	const contact = (name, met, events, ideas, openIdeas) => ({ file: { basename: name }, met, events, ideas, openIdeas });
	let n = 0;
	const ev = (date, type) => ({ file: { path: `Events/${n++}.md` }, date, type, status: "open" });
	const text = buildYearRecap({
		year: 2026,
		generatedOn: "2026-12-30",
		contacts: [
			contact("Ann", "2026-03", [ev("2026-04-01", "hangout"), ev("2025-01-01", "hangout")], [{ done: true }, { done: false }], 1),
			contact("Bo", "2019", [ev("2026-06", "life"), ev("2026", "hangout"), ev("", "life")], [{ done: true }], 0),
			contact("Cy", "", [], [], 2),
		],
		diaryDates: ["2026-01-02", "2025-12-31", "2026-11-11"],
	});
	eq("the whole note", text.split("\n"), [
		"# Your friendships in 2026",
		"",
		"*Generated 2026-12-30. Counts, not scores — Callander doesn't grade friendships.*",
		"",
		"## New this year",
		"- [[Ann]]",
		"",
		"## Moments logged",
		"- [[Ann]] — 1 event",
		"- [[Bo]] — 2 events",
		"",
		"**3 events across everyone** — 2 hangouts, 1 of their life moments witnessed.",
		"",
		"## Ideas",
		"- 2 ideas checked off all-time",
		"- 3 still open — fuel for next year",
		"",
		"## Diary",
		"- 2 entries about 2026",
		"",
	]);
	const empty = buildYearRecap({ year: 2026, generatedOn: "2026-01-01", contacts: [], diaryDates: [] });
	eq("no new friends, no section; one hangout singular", empty.includes("## New this year"), false);
	eq("zero counts plural", empty.includes("**0 events across everyone** — 0 hangouts"), true);
	return result();
}
