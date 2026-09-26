import { usePlugin } from "@/ui/PluginContext";
import { deviceZone, zoneLabel } from "@/utils/timezone";
import {
	SNOOZE_OPTIONS,
	shouldShowTimezoneBanner,
	snoozeUntil,
	type SnoozeOptionId,
} from "@/utils/timezoneBanner";

/**
 * "Times are shown in X" — the React twin of appendTimezoneBanner, which
 * the Events and Calendar pages (imperative DOM) use. Same rules, same
 * markup shape, so the notice reads identically everywhere it appears; see
 * timezoneBanner.ts for why you're seeing it and what snoozing does.
 */
export function TimezoneBanner() {
	const plugin = usePlugin();
	const settings = plugin.settings;
	const device = deviceZone();

	if (
		!shouldShowTimezoneBanner(
			settings.displayTimezone,
			device,
			settings.timezoneBannerSnoozedUntil
		)
	) {
		return null;
	}

	const snooze = (id: SnoozeOptionId) => {
		settings.timezoneBannerSnoozedUntil = snoozeUntil(id);
		void plugin.saveSettings();
	};

	return (
		<div className="timezone-banner">
			<span className="timezone-banner-text">
				Times shown in {zoneLabel(settings.displayTimezone)} (set in
				Plugin timezone)
			</span>
			<select
				className="dropdown timezone-banner-snooze"
				aria-label="Snooze this notice"
				defaultValue=""
				onChange={(e) => {
					const value = e.currentTarget.value as SnoozeOptionId;
					if (value) snooze(value);
					e.currentTarget.value = "";
				}}
			>
				<option value="" disabled>
					Snooze
				</option>
				{SNOOZE_OPTIONS.map((o) => (
					<option key={o.id} value={o.id}>
						{o.label}
					</option>
				))}
			</select>
		</div>
	);
}
