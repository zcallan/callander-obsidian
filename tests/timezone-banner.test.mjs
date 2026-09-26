import { createSuite } from "./harness.mjs";
import {
	isSnoozed,
	shouldShowTimezoneBanner,
	snoozeUntil,
} from "./.build/callander.mjs";

/**
 * The pinned-zone banner's own rules: when it's owed, and how long a
 * snooze actually lasts. Kept pure and separate from the three places it's
 * drawn, so the logic is pinned once rather than copied three times.
 */
export function run() {
	const { eq, result } = createSuite("timezone banner");

	const now = new Date(2026, 8, 21, 12, 0, 0); // Monday 21 Sept 2026, noon

	// ---------- whether it shows at all ----------
	eq("no pin, no banner", shouldShowTimezoneBanner("", "America/New_York", "", now), false);
	eq(
		"pinned to the device's own zone is not a mismatch",
		shouldShowTimezoneBanner("America/New_York", "America/New_York", "", now),
		false
	);
	eq(
		"pinned to somewhere else shows it",
		shouldShowTimezoneBanner("America/Chicago", "America/New_York", "", now),
		true
	);

	// ---------- snoozing ----------
	eq("not snoozed", isSnoozed("", now), false);
	eq("forever is snoozed", isSnoozed("forever", now), true);
	eq("garbage is treated as not snoozed", isSnoozed("not a date", now), false);
	{
		const until = snoozeUntil("7", now);
		eq("still snoozed the next day", isSnoozed(until, new Date(2026, 8, 22)), true);
		eq("still snoozed right at 6 days", isSnoozed(until, new Date(2026, 8, 27)), true);
		eq("no longer snoozed after 7 days", isSnoozed(until, new Date(2026, 8, 29)), false);
	}
	eq("a snooze exactly the length asked for a day", snoozeUntil("1", now) > now.toISOString(), true);

	// ---------- the two combined ----------
	eq(
		"a live snooze hides the banner even though the zones differ",
		shouldShowTimezoneBanner("America/Chicago", "America/New_York", "forever", now),
		false
	);
	{
		const until = snoozeUntil("1", now);
		eq(
			"...until the snooze runs out",
			shouldShowTimezoneBanner("America/Chicago", "America/New_York", until, new Date(2026, 8, 23)),
			true
		);
	}

	return result();
}
