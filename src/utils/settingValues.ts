/**
 * The number settings' bounds, shared by both settings paths (Obsidian
 * 1.13's declarative tab and the fallback for older versions) so the two
 * can't accept different values.
 */

export const NUMBER_SETTING_BOUNDS = {
	birthdayReminderDays: { min: 1, max: 60, integer: true },
	belatedBirthdayDays: { min: 0, max: 60, integer: true },
	dashboardSomedayCount: { min: 1, max: 50, integer: true },
	dashboardFriendSuggestionCount: { min: 1, max: 50, integer: true },
	receiptTaxPercent: { min: 0, max: 100, integer: false },
	receiptTipPercent: { min: 0, max: 100, integer: false },
} as const;

export type NumberSettingKey = keyof typeof NUMBER_SETTING_BOUNDS;

export function isNumberSettingKey(key: string): key is NumberSettingKey {
	return Object.prototype.hasOwnProperty.call(NUMBER_SETTING_BOUNDS, key);
}

/**
 * A typed value for a number setting, clamped to its bounds and rounded
 * when it counts things; null for an empty or non-numeric field, which is
 * left unsaved rather than read as 0.
 */
export function clampSetting(key: NumberSettingKey, raw: unknown): number | null {
	if (raw === null || raw === undefined) return null;
	if (typeof raw === "string" && raw.trim() === "") return null;
	const n = Number(raw);
	if (!Number.isFinite(n)) return null;
	const { min, max, integer } = NUMBER_SETTING_BOUNDS[key];
	return Math.min(max, Math.max(min, integer ? Math.round(n) : n));
}
