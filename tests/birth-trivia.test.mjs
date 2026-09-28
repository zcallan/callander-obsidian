import { createSuite } from "./harness.mjs";
import { birthFlower, birthstone, chineseZodiac, zodiacSign } from "./.build/callander.mjs";

/**
 * The star-sign table against the if-chain it replaced, copied here
 * verbatim, for every month and day parseFlexDate lets through (it checks
 * a day against 31, not its month, so 30 February is included).
 */
function oldZodiacSign(month, day) {
	if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return "Aries";
	if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return "Taurus";
	if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return "Gemini";
	if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return "Cancer";
	if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return "Leo";
	if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return "Virgo";
	if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return "Libra";
	if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return "Scorpio";
	if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return "Sagittarius";
	if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return "Capricorn";
	if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return "Aquarius";
	return "Pisces";
}

export function run() {
	const { eq, result } = createSuite("birth trivia");

	const differences = [];
	for (let m = 1; m <= 12; m++) {
		for (let d = 1; d <= 31; d++) {
			if (zodiacSign(m, d) !== oldZodiacSign(m, d)) differences.push(`${m}-${d}`);
		}
	}
	eq("the table agrees with the old chain on all 372 month-days", differences, []);
	eq("the cusps", [zodiacSign(1, 19), zodiacSign(1, 20), zodiacSign(12, 21), zodiacSign(12, 22)], ["Capricorn", "Aquarius", "Sagittarius", "Capricorn"]);

	eq("Chinese zodiac by calendar year", [chineseZodiac(2026), chineseZodiac(2020), chineseZodiac(1990)], ["Year of the Horse", "Year of the Rat", "Year of the Horse"]);
	eq("stones and flowers, and out of range", [birthstone(1), birthstone(12), birthstone(13), birthFlower(5), birthFlower(0)], ["Garnet", "Turquoise", "Unknown", "Lily of the valley", "Unknown"]);
	return result();
}
