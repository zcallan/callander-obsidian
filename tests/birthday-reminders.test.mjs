import { createSuite } from "./harness.mjs";
import {
	birthdayNotificationBody,
	birthdayStatusLabel,
	joinWithAnd,
	metAnniversaryNotices,
	todayBirthdayNotice,
	upcomingBirthdayDigest,
} from "./.build/callander.mjs";

export function run() {
	const { eq, result } = createSuite("birthday reminders");
	const c = (displayName, daysUntilBirthday, age = null, met = "") => ({ displayName, daysUntilBirthday, age, met });

	eq("names joined", [joinWithAnd(["Ann"]), joinWithAnd(["Ann", "Bo"]), joinWithAnd(["Ann", "Bo", "Cy"]), joinWithAnd([])], ["Ann", "Ann and Bo", "Ann, Bo and Cy", ""]);
	eq("today's notice", todayBirthdayNotice([c("Ann", 0), c("Bo", 3), c("Cy", 0)]), "🎂 It's Ann and Cy's birthday today!");
	eq("nobody today", todayBirthdayNotice([c("Bo", 3), c("Dee", null)]), null);
	eq("the notification, with and without an age", [birthdayNotificationBody(c("Ann", 0, 30)), birthdayNotificationBody(c("Bo", 0))], [
		"🎂 It's Ann's birthday today — turning 30!",
		"🎂 It's Bo's birthday today!",
	]);

	const people = [c("Late", 8), c("Today", 0), c("Soon", 1), c("Mid", 7), c("None", null)];
	eq("the digest: tomorrow to the window's edge, soonest first", upcomingBirthdayDigest(people, 7), "🎈 Upcoming birthdays: Soon tomorrow · Mid in 7 days");
	eq("an empty digest is null", upcomingBirthdayDigest([c("Today", 0)], 7), null);
	eq("the status bar: today counts", birthdayStatusLabel(people, 7), "🎂 Today today!");
	eq("…otherwise the next inside the window", birthdayStatusLabel([c("Late", 8), c("Mid", 7)], 7), "🎂 Mid 7d");
	eq("…and nothing beyond it", birthdayStatusLabel([c("Late", 8)], 7), "");

	const now = new Date(2026, 7, 5, 12);
	eq(
		"met anniversaries: exact day only, zero years skipped",
		metAnniversaryNotices([c("A", null, null, "2020-08-05"), c("B", null, null, "2025-08-05"), c("C", null, null, "2026-08-05"), c("D", null, null, "2020-08"), c("E", null, null, "08-05")], now),
		["🤝 6 years since you met A today!", "🤝 1 year since you met B today!"]
	);
	return result();
}
