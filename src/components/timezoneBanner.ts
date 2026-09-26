import type FriendTracker from "@/main";
import { deviceZone, zoneLabel } from "@/utils/timezone";
import {
	SNOOZE_OPTIONS,
	shouldShowTimezoneBanner,
	snoozeUntil,
	type SnoozeOptionId,
} from "@/utils/timezoneBanner";

/**
 * "Times are shown in X" — the imperative twin of TimezoneBanner.tsx, for
 * the Events and Calendar pages. Same rules, same markup shape as the
 * dashboard's own, so the notice reads identically wherever it turns up.
 *
 * Renders nothing (and returns without touching `container`) when the
 * banner doesn't apply, so a caller can call this unconditionally on every
 * render.
 */
export function appendTimezoneBanner(
	container: HTMLElement,
	plugin: FriendTracker,
	/** Called after a snooze is saved, to redraw without the banner. */
	onSnoozed: () => void
): void {
	const settings = plugin.settings;
	if (
		!shouldShowTimezoneBanner(
			settings.displayTimezone,
			deviceZone(),
			settings.timezoneBannerSnoozedUntil
		)
	) {
		return;
	}

	const banner = container.createDiv({ cls: "timezone-banner" });
	banner.createSpan({
		cls: "timezone-banner-text",
		text: `Times shown in ${zoneLabel(
			settings.displayTimezone
		)} (set in Plugin timezone)`,
	});
	const select = banner.createEl("select", {
		cls: "dropdown timezone-banner-snooze",
		attr: { "aria-label": "Snooze this notice" },
	});
	select.createEl("option", { text: "Snooze", value: "", attr: { disabled: true } });
	for (const o of SNOOZE_OPTIONS) {
		select.createEl("option", { text: o.label, value: o.id });
	}
	select.value = "";
	select.addEventListener("change", () => {
		const value = select.value as SnoozeOptionId | "";
		if (!value) return;
		settings.timezoneBannerSnoozedUntil = snoozeUntil(value);
		void plugin.saveSettings();
		onSnoozed();
	});
}
