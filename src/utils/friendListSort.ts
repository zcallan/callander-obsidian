/**
 * The All friends list's eleven sorts. Unknowns sort last through
 * sentinels chosen outside each key's usual range; they're kept exactly,
 * since a nulls-last comparator orders a few edge values differently
 * (a negative age from a future birth year, an age above 999).
 */

import type { ContactWithCountdown, FriendListSort } from "@/types";
import { flexSortKey, parseFlexDate } from "@/utils/flexdate";
import {
	calendarBirthdayKey,
	nextBirthdayOccurrence,
} from "@/utils/friendTimeline";

/** Sorts `list` in place by `sort`, and returns it. */
export function sortFriends(
	list: ContactWithCountdown[],
	sort: FriendListSort,
	now: Date
): ContactWithCountdown[] {

	// Unknown sorts past December in either direction.
	const calendarRank = (c: ContactWithCountdown): number =>
		calendarBirthdayKey(c.birthday) ?? 99_99;

	const lastEventKey = (c: ContactWithCountdown): number => {
		let max = -1;
		for (const e of c.events) {
			const parsed = parseFlexDate(e.date);
			if (parsed) max = Math.max(max, flexSortKey(parsed));
		}
		return max;
	};

	// Days to the next birthday, counting a month-only one as the 1st of
	// that month so it sorts with its month rather than falling to the
	// bottom with the people who have no birthday at all. The dashboard
	// countdown deliberately doesn't do this — see OccurrenceOptions.
	const untilBirthday = (c: ContactWithCountdown): number =>
		nextBirthdayOccurrence(c.birthday, now, {
			assumeFirstOfMonth: true,
		})?.days ?? 9999;

	switch (sort) {
		case "newest":
			list.sort((a, b) => b.file.stat.ctime - a.file.stat.ctime);
			break;
		case "oldest":
			list.sort((a, b) => a.file.stat.ctime - b.file.stat.ctime);
			break;
		case "birthday":
			list.sort((a, b) => untilBirthday(a) - untilBirthday(b));
			break;
		// Calendar position, not proximity: January first whatever the
		// date is today. Anyone with no month recorded has no place in
		// that order and goes last in both directions, rather than
		// leading the reverse.
		case "birthdayJanDec":
			list.sort((a, b) => calendarRank(a) - calendarRank(b));
			break;
		case "birthdayDecJan":
			list.sort((a, b) => {
				const ka = calendarBirthdayKey(a.birthday);
				const kb = calendarBirthdayKey(b.birthday);
				if (ka === null || kb === null) {
					return calendarRank(a) - calendarRank(b);
				}
				return kb - ka;
			});
			break;
		case "lastEvent":
			list.sort((a, b) => lastEventKey(b) - lastEventKey(a));
			break;
		case "youngest":
			list.sort((a, b) => (a.age ?? 999) - (b.age ?? 999));
			break;
		case "eldest":
			list.sort((a, b) => (b.age ?? -1) - (a.age ?? -1));
			break;
		case "modified":
			list.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
			break;
		case "alphabeticalDesc":
			list.sort((a, b) => b.displayName.localeCompare(a.displayName));
			break;
		default:
			list.sort((a, b) => a.displayName.localeCompare(b.displayName));
	}
	return list;
}
