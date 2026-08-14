/**
 * The cast the example vault is built from: a book club you'd be lucky to
 * be in.
 *
 * The people are real authors, used the way the original example vault used
 * Orwell and Steinbeck — a recognisable, obviously-playful stand-in for your
 * actual friends. The fun facts and trivia are real and are the point. The
 * birthdays, gift ideas, drafts and inside jokes are invented, because
 * that's the part only a friend would know.
 *
 * Birth *years* are deliberately not factual either: several of these
 * authors are historical, and their real years put the All friends table at
 * "Age 205", which reads as a bug rather than a joke. Ages here land
 * between 35 and 78.
 *
 * Dates are offsets in days from today, never literals. The whole UI is
 * relative dates, so a vault with fixed dates only photographs correctly on
 * the day it was written. See make-seed.mjs.
 */

/** The vault's owner — whoever is doing the remembering. */
export const OWNER = "Callan";

export const GROUPS = [
	{ name: "Book club", color: "#9a7ef0" },
	{ name: "Hiking", color: "#e69735" },
	{ name: "Writers' room", color: "#5aa9e6" },
	{ name: "Pen pals", color: "#5cb870" },
];

/**
 * `bd` is the birthday offset in days from today, `year` the birth year.
 * Neither is factual — see the note at the top.
 */
export const PEOPLE = [
	{
		name: "George Orwell",
		shortName: "Eric",
		nicknames: ["Eric"],
		year: 1958,
		bd: 2,
		met: -1580,
		relationship: "friend",
		groups: ["book club", "writers' room"],
		hometown: "Motihari, India",
		location: "London",
		ideas: [
			{ category: "gift", text: "A proper loose-leaf tea caddy — he has opinions", done: false },
			{ category: "gift", text: "Good secateurs for the roses", done: false },
			{ category: "conversation", text: "Ask how the shop's doing and whether Muriel behaved", done: false },
			{ category: "activity", text: "Walk the allotments with him next time I'm over", done: false, resurface: 21 },
			{ category: "book", text: "Lend him the Zamyatin I keep going on about", done: true },
		],
		interests: [
			{ category: "drinks", text: "Tea, strong, no sugar — and he will explain why" },
			{ category: "hobbies", text: "Growing roses" },
			{ category: "hobbies", text: "Keeping goats" },
			{ category: "foods", text: "A properly made cup of tea counts as a food group" },
			{ category: "other", text: "Village shops" },
		],
		funFacts: [
			"Born Eric Arthur Blair — the pen name came later, and it stuck",
			"Wrote an entire essay laying out eleven rules for making a cup of tea",
			"Kept a goat called Muriel, and later gave her name to a goat in Animal Farm",
			"Planted roses at his cottage that outlived nearly everything else he owned",
			"Coined 'Big Brother', 'thoughtcrime' and 'doublethink' — all in one book",
		],
		insideJokes: [
			{ text: "Rule Eleven", context: "There are eleven rules for tea and he checks you on all of them" },
		],
		quotes: [{ text: "Good prose is like a windowpane.", context: "Over the third pot of tea" }],
		drafts: [{ text: "He mentioned wanting to show me the allotment on the next visit", created: -3 }],
		notes: "Writes in the mornings, gardens in the afternoons, so evenings are the safe time to call.",
	},
	{
		name: "Haruki Murakami",
		year: 1949,
		bd: 14,
		met: -940,
		relationship: "friend",
		groups: ["book club", "hiking"],
		hometown: "Kyoto",
		location: "Tokyo",
		ideas: [
			{ category: "gift", text: "A clean Blue Note pressing from Cheapo Records", done: false },
			{ category: "place", text: "That tiny ramen place off Mass Ave he hasn't tried", done: false },
		],
		interests: [
			{ category: "music", text: "Jazz, on vinyl, loudly" },
			{ category: "sports", text: "Marathon running" },
			{ category: "foods", text: "Anything eaten standing up at a counter" },
		],
		funFacts: [
			"Ran a Tokyo jazz bar called Peter Cat before he published anything",
			"Has run a marathon almost every year for decades, and wrote a book about why",
			"Translates American novels into Japanese for fun — Fitzgerald and Carver among them",
			"Owns a record collection large enough to have its own filing system",
		],
	},
	{
		name: "Cormac McCarthy",
		shortName: "Mac",
		year: 1955,
		bd: -8,
		met: -2100,
		relationship: "friend",
		groups: ["writers' room", "hiking"],
		hometown: "Providence, Rhode Island",
		location: "Santa Fe, New Mexico",
		ideas: [
			{ category: "gift", text: "Typewriter ribbon — the exact one, he'll know if it's wrong", done: false },
			{ category: "conversation", text: "Ask what the physicists are arguing about this month", done: false },
		],
		interests: [
			{ category: "hobbies", text: "Reading physics papers for pleasure" },
			{ category: "other", text: "Deserts, at first light" },
		],
		funFacts: [
			"Wrote nearly everything on one Olivetti typewriter he bought secondhand in 1963",
			"Auctioned that typewriter for charity, then replaced it with an identical one for about eleven dollars",
			"Spends his time at a physics institute rather than with other novelists, and edits their papers",
			"Will not use quotation marks, and has never once been talked out of it",
		],
		insideJokes: [{ text: "The eleven-dollar typewriter", context: "Still the best deal anyone at the table has made" }],
	},
	{
		name: "Sally Rooney",
		year: 1991,
		bd: 25,
		met: -700,
		relationship: "friend",
		groups: ["book club", "pen pals"],
		hometown: "Castlebar, County Mayo",
		location: "Dublin",
		ideas: [{ category: "gift", text: "The good Porter Square Books tote", done: false }],
		interests: [
			{ category: "books", text: "Anything by Natalia Ginzburg" },
			{ category: "drinks", text: "Coffee, and a lot of it" },
		],
		funFacts: [
			"Was ranked the top competitive debater in Europe as a student, then quit and wrote an essay about why",
			"Leaves out quotation marks too — she and Cormac have a running agreement about it",
		],
	},
	{
		name: "John Steinbeck",
		year: 1962,
		bd: 41,
		met: -4000,
		relationship: "friend",
		groups: ["book club", "hiking"],
		hometown: "Salinas, California",
		location: "Sag Harbor, New York",
		ideas: [{ category: "gift", text: "A decent camp percolator for the truck", done: false }],
		interests: [
			{ category: "hobbies", text: "Road trips with no fixed plan" },
			{ category: "other", text: "Dogs, all of them, immediately" },
		],
		funFacts: [
			"Drove across America with his poodle Charley in a camper he named Rocinante, after Don Quixote's horse",
			"Picked fruit and dug foundations before he ever earned a living writing",
		],
	},
	{
		name: "George R.R. Martin",
		shortName: "George R.R.",
		year: 1948,
		bd: 63,
		met: -520,
		relationship: "friend",
		groups: ["writers' room", "pen pals"],
		hometown: "Bayonne, New Jersey",
		location: "Santa Fe, New Mexico",
		ideas: [{ category: "gift", text: "Anything that runs on a floppy disk, apparently", done: false }],
		interests: [
			{ category: "games", text: "Chess" },
			{ category: "movie", text: "Whatever's showing at his cinema this week" },
		],
		funFacts: [
			"Still writes on a DOS machine running WordStar 4.0, kept offline on purpose",
			"Ran chess tournaments professionally in the 1970s",
			"Bought and restored an old Santa Fe cinema, and programmes it himself",
			"Lives close enough to Cormac that they turn up to the same things by accident",
		],
	},
	{
		name: "Fyodor Dostoevsky",
		shortName: "Fyodor",
		year: 1953,
		bd: 88,
		met: -1200,
		relationship: "friend",
		groups: ["writers' room", "pen pals"],
		hometown: "Moscow",
		location: "St Petersburg",
		interests: [
			{ category: "drinks", text: "Tea, constantly, at all hours" },
			{ category: "books", text: "Anything by Dickens" },
		],
		funFacts: [
			"Wrote an entire novel in twenty-six days to make a deadline, dictating it to a stenographer",
			"Then married the stenographer, which by any measure is a good outcome",
			"A devoted Dickens reader — he'd talk about him for hours given the chance",
		],
	},
	{
		name: "John Williams",
		shortName: "John W.",
		year: 1960,
		bd: 110,
		met: -6000,
		relationship: "friend",
		groups: ["writers' room"],
		hometown: "Clarksville, Texas",
		location: "Denver, Colorado",
		interests: [{ category: "hobbies", text: "Teaching, and pretending it isn't his favourite part" }],
		funFacts: [
			"Taught at the same university for thirty years and edited its literary journal",
			"Won a National Book Award and had to share it — the judges couldn't choose",
			"His quietest novel found a huge audience in Europe half a century after it came out",
		],
	},
];

/**
 * `variant: "reminder"` is a calendar entry (shows on the dashboard);
 * `"timeline"` is a record of something that happened to someone.
 */
export const EVENTS = [
	{
		name: "Dinner at Neptune Oyster",
		day: 3,
		time: "19:30",
		type: "hangout",
		location: "Neptune Oyster, North End",
		people: ["Haruki Murakami", "Sally Rooney"],
		variant: "reminder",
		description: "Booked under Sally, which took three attempts",
	},
	{
		name: "Folk night at Club Passim",
		day: 8,
		time: "20:00",
		type: "concert",
		location: "Club Passim, Harvard Square",
		people: ["George Orwell"],
		variant: "reminder",
		link: "https://example.com/passim",
	},
	{ name: "Renew the library card", day: 12, type: "task", variant: "reminder" },
	{
		name: "Book club — Nineteen Eighty-Four",
		day: 17,
		time: "19:00",
		type: "event",
		location: "Brookline Booksmith",
		people: ["George Orwell", "Sally Rooney", "Haruki Murakami"],
		variant: "reminder",
		description: "George has promised not to spoil his own ending",
	},
	{
		name: "Red Sox vs Yankees",
		day: 25,
		time: "19:10",
		type: "event",
		location: "Fenway Park",
		people: ["John Steinbeck", "Cormac McCarthy"],
		variant: "reminder",
	},
	{
		name: "Chess night at the Cocteau",
		day: 31,
		type: "event",
		location: "Santa Fe, New Mexico",
		people: ["George R.R. Martin"],
		variant: "reminder",
		status: "cancelled",
	},
	{
		name: "Board games at Fyodor's",
		day: -5,
		type: "hangout",
		location: "St Petersburg",
		people: ["Fyodor Dostoevsky", "John Williams"],
		variant: "reminder",
	},
	{
		name: "Comedy at The Wilbur",
		day: -21,
		type: "comedy",
		location: "The Wilbur Theatre",
		people: ["Sally Rooney"],
		variant: "reminder",
	},
	{
		name: "Gave George the tea caddy",
		day: -96,
		type: "given",
		people: ["George Orwell"],
		variant: "timeline",
	},
	{
		name: "Haruki's record shelf finally collapsed",
		day: -240,
		type: "milestone",
		location: "Tokyo",
		people: ["Haruki Murakami"],
		variant: "timeline",
		description: "He rebuilt it wider and immediately filled it",
	},
	{
		name: "Cormac replaced the typewriter",
		day: -430,
		type: "milestone",
		people: ["Cormac McCarthy"],
		variant: "timeline",
		description: "Eleven dollars, identical model, no ceremony",
	},
	{
		name: "Met George at a signing in Harvard Square",
		day: -1580,
		type: "milestone",
		people: ["George Orwell"],
		variant: "timeline",
	},
	{
		name: "The Cocteau reopened",
		day: -620,
		type: "milestone",
		location: "Santa Fe, New Mexico",
		people: ["George R.R. Martin"],
		variant: "timeline",
	},
	{
		name: "Ridge walk with Cormac and Haruki",
		day: -140,
		type: "trip",
		location: "Franconia Notch, New Hampshire",
		people: ["Cormac McCarthy", "Haruki Murakami"],
		variant: "timeline",
	},
];
