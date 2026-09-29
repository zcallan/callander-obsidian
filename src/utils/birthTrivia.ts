/**
 * The contact page's birthday trivia: star sign, Chinese zodiac,
 * birthstone and birth flower.
 */

/** Each sign and the day it starts, in calendar order from January. */
const ZODIAC_STARTS: readonly { sign: string; month: number; day: number }[] = [
	{ sign: "Aquarius", month: 1, day: 20 },
	{ sign: "Pisces", month: 2, day: 19 },
	{ sign: "Aries", month: 3, day: 21 },
	{ sign: "Taurus", month: 4, day: 20 },
	{ sign: "Gemini", month: 5, day: 21 },
	{ sign: "Cancer", month: 6, day: 21 },
	{ sign: "Leo", month: 7, day: 23 },
	{ sign: "Virgo", month: 8, day: 23 },
	{ sign: "Libra", month: 9, day: 23 },
	{ sign: "Scorpio", month: 10, day: 23 },
	{ sign: "Sagittarius", month: 11, day: 22 },
	{ sign: "Capricorn", month: 12, day: 22 },
];

/** The star sign for a month (1–12) and day. Capricorn wraps into January. */
export function zodiacSign(month: number, day: number): string {
	const key = month * 100 + day;
	let sign = "Capricorn";
	for (const start of ZODIAC_STARTS) {
		if (key >= start.month * 100 + start.day) sign = start.sign;
	}
	return sign;
}

const CHINESE_ZODIAC = [
	"Rat",
	"Ox",
	"Tiger",
	"Rabbit",
	"Dragon",
	"Snake",
	"Horse",
	"Goat",
	"Monkey",
	"Rooster",
	"Dog",
	"Pig",
];

/** The animal of the Chinese year that starts in Gregorian `year`; 4 AD
 * was a Rat year. */
function animalOf(year: number): string {
	return CHINESE_ZODIAC[(((year - 4) % 12) + 12) % 12];
}

/**
 * "Year of the Horse" for someone born in 2026 — by the lunar year, which
 * starts at Lunar New Year, not 1 January.
 *
 * Lunar New Year always falls between 21 January and 20 February. So a
 * birthday before the 21st of January is the previous year's animal, one
 * after the 20th of February is its own year's, and one in between (or a
 * January or February birthday without a day) could be either: it reads
 * "Year of the Snake or Horse" rather than guessing. With only a year
 * known, it's that year's animal, which it is for most of the year.
 */
export function chineseZodiac(
	year: number,
	month: number | null = null,
	day: number | null = null
): string {
	const before = animalOf(year - 1);
	const own = animalOf(year);
	if (month === null || month > 2) return `Year of the ${own}`;
	if (month === 1 && day !== null && day <= 20) return `Year of the ${before}`;
	if (month === 2 && day !== null && day > 20) return `Year of the ${own}`;
	return `Year of the ${before} or ${own}`;
}

const BIRTH_FLOWERS = [
	"Carnation",
	"Violet",
	"Daffodil",
	"Daisy",
	"Lily of the valley",
	"Rose",
	"Larkspur",
	"Gladiolus",
	"Aster",
	"Marigold",
	"Chrysanthemum",
	"Narcissus",
];

export function birthFlower(month: number): string {
	return BIRTH_FLOWERS[month - 1] ?? "Unknown";
}

const BIRTHSTONES: Record<number, string> = {
	1: "Garnet",
	2: "Amethyst",
	3: "Aquamarine",
	4: "Diamond",
	5: "Emerald",
	6: "Pearl",
	7: "Ruby",
	8: "Peridot",
	9: "Sapphire",
	10: "Opal",
	11: "Topaz",
	12: "Turquoise",
};

export function birthstone(month: number): string {
	return BIRTHSTONES[month] || "Unknown";
}
