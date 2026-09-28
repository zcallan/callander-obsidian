import { createSuite } from "./harness.mjs";
import { eventPageItem, eventPipeline, planPageItem } from "./.build/callander.mjs";

/**
 * The Events page's list, as the view decided it: when, type, category,
 * person and search, then the chosen sort — backwards when looking back.
 */
function event(over = {}) {
	const name = over.name ?? "Dinner";
	return {
		file: { path: `Events/${name}.md` },
		name,
		date: "",
		time: "",
		type: "",
		status: "open",
		created: "",
		updated: "",
		location: "",
		people: [],
		description: "",
		categories: [],
		...over,
	};
}

export function run() {
	const { eq, result } = createSuite("event list");
	const now = new Date(2026, 7, 5, 12);
	const lookup = {
		paths: (e) => e.people.map((p) => `People/${p.replace(/^\[\[|\]\]$/g, "")}.md`),
		names: (e) => e.people.map((p) => p.replace(/^\[\[|\]\]$/g, "")).join(", "),
	};
	const items = [
		eventPageItem(event({ name: "Gig", date: "2026-09-01", type: "concert", categories: ["Music"], people: ["[[Ann Lee]]"] })),
		eventPageItem(event({ name: "Brunch", date: "2026-08-10", type: "hangout", location: "Café Nord" })),
		eventPageItem(event({ name: "Old gig", date: "2026-03-01", type: "concert", description: "front row" })),
		eventPageItem(event({ name: "Picnic", date: "2026-07-01" })),
		planPageItem({ file: { path: "Plans/Trip.md" }, name: "Trip", date: "2026-08-20", endDate: "2026-08-22", status: "planning", location: "", members: ["[[Bo]]"] }),
	];
	const filters = (over = {}) => ({ when: "upcoming", type: "", category: "", personPath: "", query: "", ...over });
	const names = (over, sort = "natural") => eventPipeline(items, filters(over), sort, lookup, now).map((e) => e.name);

	eq("a plan reads as a row of its own kind", [items[4].kind, items[4].type, items[4].whenDate], ["plan", "plan", "2026-08-22"]);
	eq("upcoming, soonest first, plans among events", names({}), ["Brunch", "Trip", "Gig"]);
	eq("past runs most recent first", names({ when: "past" }), ["Picnic", "Old gig"]);
	eq("a type drops plans", names({ when: "all", type: "concert" }), ["Old gig", "Gig"]);
	eq("categories match without case", names({ category: "music" }), ["Gig"]);
	eq("a person, by path", names({ personPath: "People/Bo.md" }), ["Trip"]);
	eq(
		"search reads name, description, location and full names, trimmed and any case",
		[names({ when: "all", query: "  FRONT " }), names({ query: "nord" }), names({ query: "ann lee" })],
		[["Old gig"], ["Brunch"], ["Gig"]]
	);
	eq("anyWhen ignores upcoming/past", names({ anyWhen: true }).length, 5);
	return result();
}
