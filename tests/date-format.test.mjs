import { createSuite } from "./harness.mjs";
import { formatDate, ordinalDay } from "./.build/callander.mjs";

/**
 * The house date style: en-AU, so the day comes before the month, and never
 * a comma. The words come from the runtime's locale data, so these stick to
 * formats the plugin uses, plus one where en-AU itself puts a comma.
 */
export function run() {
	const { eq, result } = createSuite("date format");

	const friday = new Date(2026, 7, 14); // Friday 14 August 2026, local time
	eq("a long weekday", formatDate(friday, { weekday: "long" }), "Friday");
	eq("a short weekday", formatDate(friday, { weekday: "short" }), "Fri");
	eq(
		"the day before the month",
		formatDate(friday, { weekday: "short", day: "numeric", month: "short" }),
		"Fri 14 Aug"
	);
	eq(
		"never a comma, even where en-AU puts one",
		formatDate(friday, {
			weekday: "short",
			day: "numeric",
			month: "short",
			year: "numeric",
		}),
		"Fri 14 Aug 2026"
	);
	eq(
		"a month and year",
		formatDate(friday, { month: "long", year: "numeric" }),
		"August 2026"
	);

	eq(
		"ordinals, the teens included",
		[1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 24, 31, 101, 111, 112, 113].map(
			ordinalDay
		),
		[
			"1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st",
			"22nd", "23rd", "24th", "31st", "101st", "111th", "112th", "113th",
		]
	);

	return result();
}
