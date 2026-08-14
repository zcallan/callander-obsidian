/**
 * Plans, somedays, diary entries and loose expenses for the example vault.
 *
 * Same rules as cast.mjs: New England throughout, invented where it's the
 * sort of thing only a friend would know, and every date an offset in days
 * from today rather than a literal.
 */

/**
 * One plan is deliberately maximal — it's the one the plan screenshots are
 * taken of, so every field that can carry data does: travel legs, stays, a
 * packing list, four different cost-split modes, a credit and drafts.
 */
export const PLANS = [
	{
		name: "🍁 Leaf-peeping in the White Mountains",
		day: 9,
		endDay: 11,
		location: "Franconia Notch, New Hampshire",
		status: "planning",
		members: ["George Orwell", "Cormac McCarthy", "Sally Rooney"],
		unconfirmedMembers: ["Haruki Murakami"],
		items: [
			{
				text: "Franconia Ridge loop",
				category: "activity",
				priority: "must",
				day: 10,
				time: "09:00",
				location: "Lafayette Place trailhead",
				notes: "About 8 hours with the ridge. Start early — the lot fills by seven.",
			},
			{
				text: "Dinner at Polly's Pancake Parlor",
				category: "restaurant",
				priority: "must",
				day: 9,
				time: "19:30",
				location: "Sugar Hill",
				cost: 45,
				people: "everyone",
			},
			{
				text: "Sunrise from Artist's Bluff",
				category: "activity",
				priority: "maybe",
				day: 11,
				time: "06:15",
				people: "Sally, me",
			},
			{ text: "Coffee in Lincoln", category: "coffee", priority: "maybe", day: 10, time: "08:00" },
			{ text: "The Flume Gorge, if it rains", category: "sightseeing", priority: "maybe" },
			{ text: "Cider donuts for the drive home", category: "shopping", priority: "maybe" },
		],
		travel: [
			{
				text: "Drive up from Boston",
				type: "car",
				day: 9,
				time: "14:00",
				duration: "2h 30m",
				people: "Cormac, Sally, me",
				booked: "none",
				cost: 62,
			},
			{
				text: "Cannon Mountain tramway",
				type: "other",
				day: 10,
				time: "11:30",
				duration: "10m",
				booked: "todo",
				notes: "Last car down is 17:00 — don't be the ones walking.",
			},
			{ text: "Drive home", type: "car", day: 11, time: "16:00", duration: "2h 30m", booked: "none" },
		],
		accommodation: [
			{
				text: "The Notch House",
				stay: "airbnb",
				day: 9,
				nights: 2,
				address: "14 Profile Road, Franconia, NH",
				booked: "booked",
				cost: 340,
				notes: "Check-in from 16:00, key in the lockbox — code 4417.",
			},
			{ text: "Franconia Inn (backup)", stay: "hotel", booked: "todo", notes: "Holds rooms until the Thursday before." },
		],
		bring: [
			{ text: "Hiking boots", done: true },
			{ text: "Rain shells", done: true },
			{ text: "Head torch", done: false },
			{ text: "Thermos", done: false },
			{ text: "The good camera", done: false },
		],
		costs: [
			{
				label: "The Notch House",
				amount: 340,
				split: {
					mode: "shares",
					shares: { Callan: 2, "George Orwell": 2, "Cormac McCarthy": 1, "Sally Rooney": 1 },
				},
			},
			{ label: "Gas", amount: 62, split: { mode: "even" } },
			{ label: "Tramway tickets", amount: 48, settled: true, split: { mode: "even" } },
			{
				label: "Dinner at Polly's",
				amount: 186.4,
				split: {
					mode: "receipt",
					shares: { Callan: 42, "George Orwell": 51, "Cormac McCarthy": 38, "Sally Rooney": 24 },
					exprs: { "George Orwell": "34+17" },
					tax: 6.25,
					tip: 20,
				},
			},
		],
		credits: [{ person: "Cormac McCarthy", amount: 25, note: "Covered the trailhead parking" }],
		drafts: [
			{ text: "Someone said there's a good bakery in Littleton", created: -2 },
			{ text: "Check whether the ridge trail is open after the storm", created: -1, day: 10 },
		],
	},
	{
		name: "🦞 Lobster roll crawl up Route 1",
		day: 34,
		location: "Mid-coast Maine",
		status: "planning",
		members: ["John Steinbeck", "George Orwell"],
		items: [
			{ text: "Start at Red's Eats in Wiscasset", category: "restaurant", priority: "must" },
			{ text: "Finish in Camden if we can still move", category: "restaurant", priority: "maybe" },
		],
	},
	{
		name: "🎿 Ski weekend in Stowe",
		day: -128,
		endDay: -121,
		location: "Stowe, Vermont",
		status: "done",
		members: ["Cormac McCarthy", "Haruki Murakami", "John Williams"],
		items: [{ text: "Lessons for whoever admits they need them", category: "activity", priority: "must" }],
		costs: [{ label: "Lift passes", amount: 420, settled: true, split: { mode: "even" } }],
	},
];

export const SOMEDAYS = [
	{
		name: "Kayak the Charles at golden hour",
		types: ["nature", "activity"],
		seasons: ["summer"],
		days: ["sat", "sun"],
		times: ["daytime"],
		company: "group",
		people: ["Haruki Murakami", "Cormac McCarthy"],
		cost: 75,
		notes: "Only worth it on a still evening — check the wind before booking.",
	},
	{
		name: "Read all of Ulysses, properly this time",
		types: ["creative"],
		company: "solo",
		days: [],
		times: ["night"],
	},
	{
		name: "The night market in Chinatown",
		types: ["food", "explore"],
		monthOffset: 1,
		days: ["thu", "fri"],
		times: ["night"],
		company: "either",
	},
	{
		name: "Ride the Swan Boats in the Public Garden",
		types: ["activity", "explore"],
		seasons: ["spring", "summer"],
		days: ["sat", "sun"],
		company: "either",
		cost: 5,
	},
	{
		name: "Cycle the Minuteman Trail end to end",
		types: ["activity", "nature"],
		seasons: ["spring", "summer"],
		days: ["sat", "sun"],
		times: ["morning"],
		company: "either",
	},
	{
		name: "The Sargent murals at the Public Library",
		types: ["museum"],
		fromDay: 20,
		untilDay: 120,
		days: ["wed", "thu", "fri"],
		company: "either",
		notes: "The tours are free but they fill up about a fortnight ahead.",
	},
	{
		name: "Learn to shuck oysters without losing a thumb",
		types: ["food", "creative"],
		company: "group",
		people: ["John Steinbeck"],
		days: [],
	},
	{
		name: "Watch the Perseids from the Blue Hills",
		types: ["nature"],
		seasons: ["summer"],
		times: ["night"],
		days: [],
		company: "either",
	},
	{ name: "Sunday roast at the Druid", types: ["food"], days: ["sun"], company: "group", status: "done" },
	{
		name: "Second-hand floor at Brookline Booksmith",
		types: ["shopping", "explore"],
		days: ["thu", "fri"],
		times: ["daytime"],
		company: "either",
	},
];

export const DIARY = [
	{
		day: 0,
		title: "Coffee with Haruki",
		body: "Went with [[Haruki Murakami]] to the place on Mass Ave.\n\nHe's deep in a draft and doing that thing where he talks around it rather than about it. Bought far too many records afterwards, as is traditional.",
	},
	{
		day: -2,
		title: "Long way round",
		body: "Walked the Esplanade with [[Cormac McCarthy]]. He explained something about entropy for about forty minutes.\n\nDidn't mind a bit.",
	},
	{
		day: -5,
		title: "Board games at Fyodor's",
		body: "[[Fyodor Dostoevsky]] taught everyone a card game and then won it four times running. [[John Williams]] has requested a rematch.",
	},
	{
		day: -12,
		title: "First warm evening",
		body: "Sat out on the roof for the first time this year. [[George Orwell]] brought tea and a full lecture on how to make it.",
	},
	{
		day: -30,
		title: "Franconia, early",
		body: "Out before six with [[Sally Rooney]]. Cloud sat in the notch the whole way up and then broke all at once at the top.",
	},
];

/**
 * Loose expenses on the dashboard — not attached to any plan. One per split
 * mode, each naming two other people so the edit modal shows three
 * participants including you.
 */
export const EXPENSES = [
	{
		label: "Taxi back from the Wilbur",
		amount: 34.5,
		people: ["Sally Rooney", "John Williams"],
		split: { mode: "even" },
	},
	{
		label: "Groceries for book club",
		amount: 128.4,
		people: ["Haruki Murakami", "George Orwell"],
		split: {
			mode: "percent",
			shares: { Callan: 50, "Haruki Murakami": 30, "George Orwell": 20 },
		},
	},
	{
		label: "Dinner at Neptune Oyster",
		amount: 214.75,
		people: ["Sally Rooney", "John Steinbeck"],
		split: {
			mode: "receipt",
			shares: { Callan: 58, "Sally Rooney": 44, "John Steinbeck": 61 },
			exprs: { "John Steinbeck": "38+23" },
			tax: 6.25,
			tip: 20,
		},
	},
];

/**
 * Untriaged captures on the dashboard. Deliberately just one — the other
 * draft the dashboard shows is filed against George in cast.mjs, which
 * keeps the inbox at two without emptying the person page's own strip.
 */
export const INBOX_DRAFTS = [
	{ text: "Haruki mentioned a record fair in the fall — ask where", created: -1 },
];
