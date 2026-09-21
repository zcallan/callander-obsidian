import { createSuite } from "./harness.mjs";
import {
	categoryColor,
	categoryColors,
	groupColorFor,
	typeColorFor,
	categoryColorFor,
	calendarEventColor,
	CATEGORY_PALETTE,
	DEFAULT_GROUP_COLORS,
} from "./.build/callander.mjs";

/** "#rrggbb" → { h (degrees), l (0–1) }. */
function hsl(hex) {
	const n = parseInt(hex.slice(1), 16);
	const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	const d = max - min;
	let h = 0;
	if (d !== 0) {
		if (max === r) h = ((g - b) / d) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
	}
	return { h: (h * 60 + 360) % 360, l };
}

/** The hue bands the three kinds' colours sit in — purple, green, pink. */
const RESERVED = [
	[95, 135],
	[240, 275],
	[285, 320],
];
const inReserved = (h) => RESERVED.some(([a, b]) => h >= a && h < b);

/** Colouring "Color by group" — defaults, the palette, and hand-picked. */
export function run() {
	const { eq, ok, result } = createSuite("category color");

	// ---------- the kinds' defaults ----------
	eq("plans default to dark purple", DEFAULT_GROUP_COLORS.plan, "#4b23a8");
	eq("birthdays default to dark green", DEFAULT_GROUP_COLORS.birthday, "#126e0a");
	eq("events default to dark magenta", DEFAULT_GROUP_COLORS.event, "#970c99");
	ok(
		"…and each default sits in the band categories are kept out of",
		Object.values(DEFAULT_GROUP_COLORS).every((c) => inReserved(hsl(c).h))
	);

	// ---------- the palette ----------
	eq("a dozen colours", CATEGORY_PALETTE.length, 12);
	eq("…all different", new Set(CATEGORY_PALETTE).size, 12);
	ok(
		"none is a purple, green or pink",
		CATEGORY_PALETTE.every((c) => !inReserved(hsl(c).h))
	);
	ok(
		"none is a dark shade",
		CATEGORY_PALETTE.every((c) => hsl(c).l >= 0.4)
	);
	{
		const names = Array.from({ length: 14 }, (_, i) => `Cat ${String(i).padStart(2, "0")}`);
		const colors = categoryColors(names);
		eq(
			"the first twelve categories take the palette in order",
			names.slice(0, 12).map((n) => colors.get(n.toLowerCase())),
			[...CATEGORY_PALETTE]
		);
		eq(
			"the thirteenth is generated from its name",
			colors.get("cat 12"),
			categoryColor("Cat 12")
		);
	}
	{
		const colors = categoryColors(["Patriots", "patriots", "Sox"]);
		eq("a name repeated in another case takes one slot", colors.size, 2);
		eq("…so the next still gets the second colour", colors.get("sox"), CATEGORY_PALETTE[1]);
		eq("…and the first keeps the first", colors.get("patriots"), CATEGORY_PALETTE[0]);
	}

	// ---------- generated colours, past the twelfth ----------
	eq("the same name is always the same colour", categoryColor("Patriots"), categoryColor("Patriots"));
	eq("…regardless of case", categoryColor("Patriots"), categoryColor("patriots"));
	eq("…or surrounding space", categoryColor("Patriots"), categoryColor(" Patriots "));
	{
		const hues = [];
		for (let i = 0; i < 400; i++) {
			hues.push(Number(/^hsl\((\d+),/.exec(categoryColor(`cat-${i}`))[1]));
		}
		ok("no generated colour lands on purple, green or pink", hues.every((h) => !inReserved(h)));
		ok("…and it produces more than one hue", new Set(hues).size > 10);
	}

	// ---------- which colour wins ----------
	{
		const none = { plan: "", birthday: "", event: "", categories: {}, types: {} };
		const palette = categoryColors(["Patriots", "Sox"]);
		eq("a plan takes its default", groupColorFor("plan", none), "#4b23a8");
		eq("a birthday takes its default", groupColorFor("birthday", none), "#126e0a");
		eq("an event takes its default", groupColorFor("event", none), "#970c99");
		eq("an event with no category has no category colour", categoryColorFor([], none, palette), null);
		eq(
			"a categorised one takes its palette colour",
			categoryColorFor(["Sox"], none, palette),
			CATEGORY_PALETTE[1]
		);

		const custom = {
			plan: "#112233",
			birthday: "#445566",
			event: "#778899",
			categories: { patriots: "#aabbcc" },
			types: { sports: "#ffcc00" },
		};
		eq("a picked plan colour wins", groupColorFor("plan", custom), "#112233");
		eq("a picked birthday colour wins", groupColorFor("birthday", custom), "#445566");
		eq("a picked event colour wins", groupColorFor("event", custom), "#778899");
		eq(
			"a picked category colour beats the palette, any case",
			categoryColorFor(["PATRIOTS"], custom, palette),
			"#aabbcc"
		);
		eq(
			"the first category decides",
			categoryColorFor(["Sox", "Patriots"], custom, palette),
			CATEGORY_PALETTE[1]
		);

		eq("an untyped event has no type colour", typeColorFor("", none), null);
		eq("a typed one takes the type's own fixed colour", typeColorFor("sports", none), "#e2703a");
		eq("a picked type colour wins", typeColorFor("sports", custom), "#ffcc00");
	}

	// ---------- an event on the Calendar page ----------
	{
		const custom = { plan: "", birthday: "", event: "", categories: {}, types: {} };
		const palette = categoryColors(["Patriots"]);
		const on = { byGroup: true, byCategory: true, byType: true, custom, palette };
		const game = { color: "", type: "sports", categories: ["Patriots"] };
		const dinner = { color: "", type: "hangout", categories: [] };
		eq("its own colour beats everything", calendarEventColor({ ...game, color: "#123456" }, on), "#123456");
		eq("then its category's", calendarEventColor(game, on), CATEGORY_PALETTE[0]);
		eq(
			"…with no category, its type's",
			calendarEventColor(dinner, on),
			"#5a9cf8"
		);
		eq(
			"…or the events' colour, with type colours off too",
			calendarEventColor(dinner, { ...on, byType: false }),
			"#970c99"
		);
		eq(
			"category colours off, its type's",
			calendarEventColor(game, { ...on, byCategory: false }),
			"#e2703a"
		);
		eq(
			"category and type colours off, the events' colour",
			calendarEventColor(game, { ...on, byCategory: false, byType: false }),
			"#970c99"
		);
		eq(
			"category and type off, the events' colour",
			calendarEventColor(game, { ...on, byCategory: false, byType: false }),
			"#970c99"
		);
		eq(
			"all three off, the accent — no type fallback anymore",
			calendarEventColor(game, { ...on, byGroup: false, byCategory: false, byType: false }),
			"var(--interactive-accent)"
		);
		eq(
			"an untyped, uncategorised event with group disabled: the accent",
			calendarEventColor(dinner, { ...on, byGroup: false, byCategory: false, byType: false }),
			"var(--interactive-accent)"
		);
		eq(
			"type colours apply between category and group",
			calendarEventColor(game, { ...on, byCategory: false }),
			"#e2703a"
		);
		{
			const withType = { ...custom, types: { sports: "#ffcc00" } };
			eq(
				"a picked type colour is used over the type's fixed one",
				calendarEventColor(game, { ...on, byCategory: false, custom: withType }),
				"#ffcc00"
			);
			eq(
				"…but a category still wins over it",
				calendarEventColor(game, { ...on, custom: withType }),
				CATEGORY_PALETTE[0]
			);
		}
		eq(
			"category colours work without Color by group",
			calendarEventColor(game, { ...on, byGroup: false }),
			CATEGORY_PALETTE[0]
		);
		eq(
			"…and an uncategorised event then keeps its type's",
			calendarEventColor(dinner, { ...on, byGroup: false }),
			"#5a9cf8"
		);
	}

	return result();
}
