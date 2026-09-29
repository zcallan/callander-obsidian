import { Notice, setIcon } from "obsidian";
import { shortMonthName } from "@/utils/flexdate";
import { formatDate } from "@/utils/dateFormat";
import { buildUpcomingRow } from "@/components/UpcomingRow";
import { conversationalLabel } from "@/utils/upcomingWhen";
import { formatCount } from "@/utils/text";
import {
	lastOccurrenceDate,
	missedBirthdays,
	UPCOMING_BIRTHDAY_DAYS,
	upcomingBirthdays,
} from "@/utils/birthdayLists";
import { runAction } from "@/utils/async";
import type { DashboardContext } from "@/views/DashboardView/context";
import { makeDisclosure } from "@/components/activatable";

export function renderUpcomingBirthdays(
	ctx: DashboardContext,
	container: HTMLElement
) {
	const HORIZON = UPCOMING_BIRTHDAY_DAYS;
	const upcoming = upcomingBirthdays(ctx.data.contacts, HORIZON, new Date());

	const wrap = container.createDiv({
		cls: "dashboard-section plan-accordion dashboard-birthdays-accordion",
	});
	const header = wrap.createDiv({
		cls: "dashboard-section-header plan-accordion-header",
	});
	const heading = header.createEl("h3", {
		text: "🎂 Upcoming birthdays",
	});
	if (upcoming.length > 0) {
		heading.createSpan({
			cls: "dashboard-count-badge",
			text: String(upcoming.length),
		});
	}
	setIcon(
		header.createSpan({ cls: "plan-accordion-chevron" }),
		"chevron-down"
	);
	const section = wrap.createDiv({ cls: "plan-accordion-body" });

	const applyOpen = () =>
		wrap.toggleClass(
			"is-open",
			!ctx.plugin.settings.birthdaysCollapsed
		);
	applyOpen();
	makeDisclosure(
		header,
		wrap,
		() => {
			ctx.plugin.settings.birthdaysCollapsed =
				!ctx.plugin.settings.birthdaysCollapsed;
			applyOpen();
			// Persisted rather than held on the view: the dashboard is
			// torn down and rebuilt on every open, so in-memory state
			// would spring back open each time.
			void ctx.plugin.saveSettings();
		},
		"section:birthdays"
	);

	if (upcoming.length === 0) {
		section.createDiv({
			cls: "section-helper-text",
			text: `Nothing in the next ${HORIZON} days.`,
		});
		return;
	}

	for (const { contact: c, days } of upcoming) {
		const giftCount = c.ideas.filter(
			(i) => !i.done && i.category === "gift"
		).length;
		const isToday = days === 0;
		const handleDone = async (e: MouseEvent) => {
			// Don't also open the contact page behind the row's click.
			e.stopPropagation();
			// Same field and shape Missed birthdays writes — today's
			// date is this year's occurrence, so the row drops out now
			// and doesn't reappear in Missed tomorrow, but a birthday is
			// never wished more than a year ahead of itself.
			await ctx.plugin.contactOperations.markBirthdayWished(
				c.file,
				lastOccurrenceDate(0, new Date())
			);
			new Notice(`🎈 Nice — ${c.displayName} checked off`);
		};
		buildUpcomingRow(section, {
			icon: "",
			// Today drops the date entirely — the row is already the
			// only one that says so, and "!" carries the occasion.
			date: isToday ? "Today!" : formatDayDate(ctx, days),
			// Bold and accented, the same emphasis its Done button gets
			// in its place on the right.
			whenTone: isToday ? "soon" : undefined,
			name: c.displayName,
			suffix:
				giftCount > 0
					? formatCount(giftCount, "gift idea")
					: "no gift ideas yet",
			// The date label already says "Tomorrow", so the count goes
			// here rather than repeating it.
			relative: isToday ? "" : `in ${formatCount(days, "day")}`,
			// This list is upcoming-only — never a past day — so soon is
			// the only tone that applies here.
			tone: days <= 1 ? "soon" : undefined,
			onClick: () => void ctx.openContact(c.file),
			focusKey: `birthday:${c.file.path}`,
			// Today swaps the countdown for the same Done action Missed
			// birthdays offers — there's nothing left to count down to.
			action: isToday
				? {
						icon: "check",
						label: "Done",
						ariaLabel: "Mark birthday as wished",
						onClick: (e) =>
							runAction("mark the birthday as wished", () =>
								handleDone(e)
							),
						// Filled purple — the day itself is the one
						// birthday row with nothing left to count down
						// to, so its Done stands out from Missed's.
						accent: true,
				  }
				: undefined,
		});
	}
}

/** Human date offset from today: "This Monday • 16 Aug", "Next Monday • 23 Aug", "Monday 16 Aug" */
export function formatDayDate(
	ctx: DashboardContext,
	offsetDays: number
): string {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() + offsetDays);
	// Close by, the weekday alone says it — same rule the Upcoming
	// section reads by, so the two lists agree.
	const near = conversationalLabel(d, offsetDays);
	if (near) return near;
	const weekday = formatDate(d, { weekday: "long" });
	return `${weekday} ${d.getDate()} ${shortMonthName(d.getMonth() + 1)}`;
}

export function renderMissedBirthdays(
	ctx: DashboardContext,
	container: HTMLElement
) {
	// How long a missed birthday stays worth acting on — the belated
	// window from settings, not a fixed horizon.
	const horizon = ctx.plugin.settings.belatedBirthdayDays;

	// Missed = passed within the window and not yet marked as wished
	const missed = missedBirthdays(ctx.data.contacts, horizon, new Date());

	if (missed.length === 0) return;

	const section = container.createDiv({
		cls: "dashboard-section dashboard-missed-section",
	});
	section.createEl("h3", { text: "🕯️ Missed birthdays" });

	for (const { contact: c, daysSince } of missed) {
		const handleWished = async (e: MouseEvent) => {
			// Don't also open the contact page behind the modal
			e.stopPropagation();
			await ctx.plugin.contactOperations.markBirthdayWished(
				c.file,
				lastOccurrenceDate(daysSince, new Date())
			);
			new Notice(`🎈 Nice — ${c.displayName} checked off`);
		};
		buildUpcomingRow(section, {
			icon: "",
			date: "",
			name: c.displayName,
			suffix:
				daysSince === 1
					? "yesterday"
					: `${daysSince} days ago`,
			// Every row here is already-passed by the section's own
			// filter (daysSinceBirthday > 0), so always red.
			suffixTone: "past",
			relative: "",
			onClick: () => void ctx.openContact(c.file),
			focusKey: `missed:${c.file.path}`,
			action: {
				icon: "check",
				label: "Done",
				ariaLabel: "Mark as wished",
				onClick: (e) =>
					runAction("mark the birthday as wished", () =>
						handleWished(e)
					),
			},
		});
	}
}
