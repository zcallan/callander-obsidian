import { createSuite } from "./harness.mjs";
import { createTestVault } from "./vault.mjs";
import { atFixedDate } from "./fixed-date.mjs";

/**
 * Ages and birthday countdowns, pinned before they move out of the contact
 * service. They read the clock themselves, so the clock is fixed: 5 August
 * 2026. Each birthday is read at the precision it was recorded at, and a
 * birthday known only to the month, or with no year, answers only what it
 * can.
 */
export async function run() {
	const { eq, result } = createSuite("age maths (fake vault)");

	await atFixedDate(new Date(2026, 7, 5, 12), async () => {
		const t = await createTestVault();
		const ops = t.contacts;
		const birthdays = {
			today: "1990-08-05",
			tomorrow: "1990-08-06",
			yesterday: "1990-08-04",
			thisMonth: "1990-08",
			nextMonth: "1990-09",
			lastMonth: "1990-07",
			yearOnly: "1990",
			noYear: "08-05",
			baby: "2026-03-01",
			newborn: "2026-08-05",
			leapDay: "2000-02-29",
			newYearsEve: "1990-12-31",
		};
		for (const [name, birthday] of Object.entries(birthdays)) {
			await t.addPerson(name, { birthday });
		}
		const contacts = await ops.getContacts();
		const of = (name) => contacts.find((c) => c.name === name);
		const age = (name) => of(name).age;
		const detailed = (name) => ops.calculateDetailedAge(birthdays[name]);

		// ---------- age ----------
		eq("on the birthday, a year older", age("today"), 36);
		eq("the day before, not yet", age("tomorrow"), 35);
		eq("the day after, still", age("yesterday"), 36);
		eq(
			"known to the month: the age they turn during it",
			[age("thisMonth"), age("nextMonth"), age("lastMonth")],
			[36, 35, 36]
		);
		eq("no age without a month and a year", [age("yearOnly"), age("noYear")], [null, null]);
		eq("under a year is 0", [age("baby"), age("newborn")], [0, 0]);

		// ---------- in years and months ----------
		eq(
			"years and months, the zeros left out",
			["today", "tomorrow", "lastMonth", "newYearsEve"].map(detailed),
			["36 years old", "35 years 11 months old", "36 years 1 month old", "35 years 7 months old"]
		);
		eq("known to the month, during it", detailed("thisMonth"), "turns 36 this month");
		eq("a baby is in months", [detailed("baby"), detailed("newborn")], ["5 months old", "0 months old"]);
		eq("nothing without a month and a year", [detailed("yearOnly"), detailed("noYear")], ["", ""]);

		// ---------- since and until ----------
		const since = (name) => ops.calculateDaysSinceBirthday(birthdays[name]);
		const until = (name) => of(name).daysUntilBirthday;
		eq("since: today is 0", since("today"), 0);
		eq("…yesterday's is 1, and tomorrow's was nearly a year ago", [since("yesterday"), since("tomorrow")], [1, 364]);
		eq("…a year isn't needed, a day is", [since("noYear"), since("thisMonth")], [0, null]);
		eq("until: today is 0, tomorrow 1", [until("today"), until("tomorrow")], [0, 1]);
		eq("…and yesterday's is almost a year off", until("yesterday"), 364);
		// Today's rule: in a year without one, 29 February falls on 1 March,
		// counting both back and forward.
		eq("a leap-day birthday, in a year without one", [age("leapDay"), since("leapDay"), until("leapDay")], [26, 157, 208]);
	});

	return result();
}
