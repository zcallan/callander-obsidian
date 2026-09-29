import { createSuite } from "./harness.mjs";
import {
	CALENDAR_PAGE_DRAWER,
	DEFAULT_SETTINGS,
	EVENTS_TAB_DRAWER,
	colorOptions,
	displayOptions,
} from "./.build/callander.mjs";

/**
 * Each drawer option writes the setting it always did — the two calendars
 * share one builder but keep separate, persisted keys, and swapping two
 * same-typed keys would bind the wrong setting silently.
 */
export function run() {
	const { eq, result } = createSuite("calendar drawer");

	const expected = {
		calendar: {
			"Wrap event names": ["calendarWrapNames", true],
			"Show second line": ["calendarHideDateTime", true],
			"Emojis on mobile": ["calendarNarrowNames", true],
			"Fade past events": ["calendarFadePastEvents", true],
			"Color backgrounds": ["calendarColorBackgrounds", true],
			"Color by category": ["calendarCustomCategoryColors", true],
			"Color by type": ["calendarColorByType", true],
			"Color by group": ["calendarColorByGroup", true],
		},
		events: {
			"Wrap event names": ["eventsCalWrapNames", true],
			"Show second line": ["eventsCalHideDateTime", true],
			"Emojis on mobile": ["eventsCalNarrowNames", true],
			"Fade past events": ["eventsCalFadePastEvents", true],
			"Color backgrounds": ["eventsCalColorBackgrounds", true],
			"Color by category": ["eventsCalUseCategoryColors", true],
			"Color by type": ["eventsCalColorByType", true],
			"Color by group": ["eventsCalColorByGroup", true],
		},
	};
	const inverted = new Set(["Show second line", "Emojis on mobile"]);

	for (const [name, keys] of [["calendar", CALENDAR_PAGE_DRAWER], ["events", EVENTS_TAB_DRAWER]]) {
		const changes = {};
		const opened = [];
		for (const make of [
			(s, apply) => displayOptions(s, keys, apply),
			(s, apply) => colorOptions(s, keys, apply, (section) => opened.push(section)),
		]) {
			// Built once to find the labels, then each option on a fresh copy.
			for (const { label } of make(structuredClone(DEFAULT_SETTINGS), () => {})) {
				const settings = structuredClone(DEFAULT_SETTINGS);
				let applied = 0;
				const option = make(settings, () => applied++).find((o) => o.label === label);
				const before = option.checked;
				// Ticking to the opposite of what's shown.
				option.onChange(!before);
				const changed = Object.keys(settings).filter((k) => JSON.stringify(settings[k]) !== JSON.stringify(DEFAULT_SETTINGS[k]));
				eq(`${name}: "${label}" reads its key${inverted.has(label) ? ", inverted" : ""}`, before, inverted.has(label) ? !DEFAULT_SETTINGS[changed[0]] : DEFAULT_SETTINGS[changed[0]]);
				changes[label] = [changed.join(","), applied === 1];
				option.action?.onClick();
			}
		}
		eq(`${name}: each option writes its own key, once`, changes, expected[name]);
		eq(`${name}: the colour buttons open their lists`, opened, ["categories", "types", "kinds"]);
	}
	return result();
}
