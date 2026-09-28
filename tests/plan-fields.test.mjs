import { createSuite } from "./harness.mjs";
import {
	bringOf,
	estimate,
	itemsOf,
	membersOf,
	simpleListOf,
	stayCategoriesOf,
} from "./.build/callander.mjs";

/**
 * The plan readers that had no direct tests before they moved out of
 * PlanOperations. Parsed items are written back as parsed, so these pin key
 * order as well as values (eq compares JSON, which keeps order).
 */
export function run() {
	const { eq, result } = createSuite("plan fields");

	eq(
		"an item's keys, in the order they're written back",
		itemsOf({
			items: [
				{ notes: "n", cost: 12, location: "l", people: "p", duration: "1h", time: "09:00", date: "2026-09-01", priority: "must", category: "cooking", text: "Pasta" },
			],
		}),
		[{ text: "Pasta", category: "cooking", priority: "must", date: "2026-09-01", time: "09:00", duration: "1h", people: "p", location: "l", cost: 12, notes: "n" }]
	);
	eq(
		"legacy shapes: food, a bucket, a bare string, an empty text",
		itemsOf({ items: [{ text: "Tacos", category: "food", bucket: "must" }, "Hike", { text: "" }] }),
		[
			{ text: "Tacos", category: "restaurant", priority: "must" },
			{ text: "Hike", category: "activity", priority: "maybe" },
		]
	);

	eq(
		"a stay's keys, in order, with Mate's folded into Home",
		simpleListOf(
			{
				accommodation: [
					{ cost: 300, notes: "n", booked: "booked", categories: [" Cabin ", ""], address: "a", checkOut: "10:00", checkIn: "15:00", nights: 3, duration: "d", people: "p", time: "t", day: "2026-09-01", stay: "friends", type: "airbnb", text: "Lake house" },
				],
			},
			"accommodation"
		),
		[{ text: "Lake house", type: "airbnb", stay: "home", date: "2026-09-01", time: "t", people: "p", duration: "d", nights: 3, checkIn: "15:00", checkOut: "10:00", address: "a", categories: ["Cabin"], booked: "booked", notes: "n", cost: 300 }]
	);
	eq(
		"a free-text day is dropped, zero nights too, and a bare string is kept",
		simpleListOf({ travel: [{ text: "Drive", day: "Saturday", nights: 0 }, "Train"] }, "travel"),
		[{ text: "Drive" }, { text: "Train" }]
	);

	eq(
		"stay categories: the declared list first, then each stay's, first spelling wins",
		stayCategoriesOf({
			accommodationCategories: ["Cabin", " "],
			accommodation: [{ text: "A", categories: ["cabin", "Beach"] }],
		}),
		["Cabin", "Beach"]
	);

	eq("members are stringified as stored", membersOf({ members: ["[[Ann]]", 7] }), ["[[Ann]]", "7"]);
	eq(
		"bring: strings read unchecked, empty ones drop",
		bringOf({ bring: ["Tent", { text: "Stove", done: 1 }, { text: "" }] }),
		[{ text: "Tent", done: false }, { text: "Stove", done: true }]
	);
	eq(
		"the estimate sums ideas, travel and stays",
		estimate({
			items: [{ text: "a", cost: 10 }, { text: "b" }],
			travel: [{ text: "c", cost: 5.5 }],
			accommodation: [{ text: "d", cost: 100 }],
		}),
		115.5
	);

	return result();
}
