import { createSuite } from "./harness.mjs";
import { somedayPlanSeed } from "./.build/callander.mjs";

export function run() {
	const { eq, result } = createSuite("someday to plan");
	const base = { name: "Trip", date: "", types: [], seasons: [], days: [], times: [], fromDate: "", untilDate: "", cost: null, notes: "", subIdeas: [], people: [] };

	eq("a bare someday seeds nothing but its name", somedayPlanSeed(base), { prefill: { name: "Trip", date: "" }, items: [], brief: "" });
	eq("a bare-year date starts the form blank; a month is kept", [somedayPlanSeed({ ...base, date: "2027" }).prefill.date, somedayPlanSeed({ ...base, date: "2027-05" }).prefill.date], ["", "2027-05"]);

	const seed = somedayPlanSeed({
		...base,
		fromDate: "2027-01",
		untilDate: "2027-06",
		cost: 400,
		notes: "Lobster rolls",
		subIdeas: [{ text: "Hike" }, { text: "Boat" }],
		people: ["[[Sam]]"],
	});
	eq("sub-ideas become maybe activities", seed.items, [
		{ text: "Hike", category: "activity", priority: "maybe" },
		{ text: "Boat", category: "activity", priority: "maybe" },
	]);
	eq("people become members", seed.members, ["[[Sam]]"]);
	eq("the brief: facts as bullets, then the notes", seed.brief, "- Earliest date: 2027-01\n- Must happen by: 2027-06\n- Rough budget: ~$400\n\nLobster rolls");
	eq("a zero budget still says so", somedayPlanSeed({ ...base, cost: 0 }).brief, "- Rough budget: ~$0");
	return result();
}
