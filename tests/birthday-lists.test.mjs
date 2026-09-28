import { createSuite } from "./harness.mjs";
import { lastOccurrenceDate, missedBirthdays, upcomingBirthdays } from "./.build/callander.mjs";

/** The dashboard's two birthday lists, as they were decided in the view. */
export function run() {
	const { eq, result } = createSuite("birthday lists");
	const today = new Date(2026, 7, 5, 15);
	const c = (name, daysUntilBirthday, daysSinceBirthday, birthdayWished = "") => ({ name, daysUntilBirthday, daysSinceBirthday, birthdayWished });

	eq("the occurrence date, local", [lastOccurrenceDate(0, today), lastOccurrenceDate(5, today), lastOccurrenceDate(6, today)], ["2026-08-05", "2026-07-31", "2026-07-30"]);

	const people = [
		c("later", 30, 335),
		c("tooFar", 31, 334),
		c("today", 0, 0),
		c("todayWished", 0, 0, "2026-08-05"),
		c("todayWishedLastYear", 0, 0, "2025-08-05"),
		c("soon", 2, 363),
		c("unknown", null, null),
	];
	eq(
		"upcoming: inside the horizon, soonest first, today's wished one dropped",
		upcomingBirthdays(people, 30, today).map((u) => [u.contact.name, u.days]),
		[["today", 0], ["todayWishedLastYear", 0], ["soon", 2], ["later", 30]]
	);

	const missed = [
		c("yesterday", 364, 1),
		c("wished", 361, 4, "2026-08-01"),
		c("wishedLastYear", 361, 4, "2025-08-01"),
		c("edge", 358, 7),
		c("gone", 357, 8),
		c("todayIsnt", 0, 0),
		c("unknown", null, null),
	];
	eq(
		"missed: after today, inside the window, not wished for that occurrence",
		missedBirthdays(missed, 7, today).map((m) => [m.contact.name, m.daysSince]),
		[["yesterday", 1], ["wishedLastYear", 4], ["edge", 7]]
	);
	return result();
}
