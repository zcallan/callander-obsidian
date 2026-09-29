import { createSuite } from "./harness.mjs";
import { DEFAULT_SETTINGS, NUMBER_SETTING_BOUNDS, clampSetting, isNumberSettingKey } from "./.build/callander.mjs";

/** The number settings, read the same way by both settings paths. */
export function run() {
	const { eq, result } = createSuite("setting values");
	eq(
		"counts are clamped and rounded",
		[clampSetting("birthdayReminderDays", "0"), clampSetting("birthdayReminderDays", "7.6"), clampSetting("birthdayReminderDays", 99), clampSetting("belatedBirthdayDays", "0")],
		[1, 8, 60, 0]
	);
	eq("percentages are clamped but keep their decimals", [clampSetting("receiptTaxPercent", "6.25"), clampSetting("receiptTipPercent", "150")], [6.25, 100]);
	eq("an empty or unreadable field isn't a value, so it isn't saved as 0 (CORE-B9)", ["", "  ", "abc", null, undefined].map((v) => clampSetting("dashboardSomedayCount", v)), [null, null, null, null, null]);
	eq("only the number settings are number settings", ["birthdayReminderDays", "yourName", "toString"].map(isNumberSettingKey), [true, false, false]);
	eq(
		"every default sits inside its own bounds",
		Object.entries(NUMBER_SETTING_BOUNDS).filter(([key, { min, max }]) => !(DEFAULT_SETTINGS[key] >= min && DEFAULT_SETTINGS[key] <= max)),
		[]
	);
	return result();
}
