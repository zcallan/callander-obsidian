import { Fragment, useMemo } from "react";
import type { EventInfo, PlanInfo } from "@/types";
import { eventRowFields } from "@/utils/eventRow";
import {
	mergeUpcoming,
	splitOverdue,
	thisAndNextWeek,
	upcomingItems,
	upcomingPlans,
	type UpcomingEntry,
} from "@/utils/upcomingList";
import { PlanGlanceModal } from "@/modals/PlanGlanceModal";
import { upcomingWhen } from "@/utils/upcomingWhen";
import { displayZone } from "@/utils/timezone";
import { splitLeadingEmoji } from "@/utils/emoji";
import { groupEventsByPeriod } from "@/utils/eventGroups";
import { EventModal } from "@/modals/EventModal";
import { EventViewModal } from "@/modals/EventViewModal";
import { usePlugin } from "@/ui/PluginContext";
import { useVaultVersion } from "@/ui/useVaultData";
import { UpcomingRow } from "@/ui/components/UpcomingRow";
import { resolvePeopleInfo } from "@/utils/people";
import { summarisePeople } from "@/utils/nameFormat";
import { shownByCategory } from "@/utils/eventCategories";
import { UpcomingSettingsModal } from "@/modals/UpcomingSettingsModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { Icon } from "@/ui/components/Icon";
import { TimezoneBanner } from "@/ui/components/TimezoneBanner";

/**
 * What's next — the section this dashboard mostly exists for.
 *
 * Reads straight off the metadata cache rather than through `useVaultQuery`:
 * `getEvents()` is synchronous, so a `useMemo` keyed on the vault version is
 * both simpler and free of the empty first frame an async read would give.
 *
 * Nothing here calls refresh. Cancelling an event from its view modal writes
 * to disk, the cache reindexes, the version bumps, and this recomputes — the
 * row disappears on its own.
 */
export function UpcomingSection() {
	const plugin = usePlugin();
	const version = useVaultVersion();

	const { overdue, groups, shownCount, hiddenCount, total } = useMemo(() => {
		const now = new Date();
		// Its own Calendars and Event category choices — see
		// UpcomingSettingsModal.
		const settings = plugin.settings;
		const events = settings.upcomingShowEvents
			? upcomingItems(
					plugin.eventOperations
						.getEvents()
						.filter(
							(e) =>
								!settings.upcomingHiddenTypes.includes(e.type) &&
								shownByCategory(
									e.categories,
									settings.upcomingHiddenCategories
								)
						),
					now
			  )
			: [];
		// A trip is the biggest thing in this window, so it belongs among
		// what's next rather than only in the Plans section further down —
		// but that's a reading preference, so it's a setting.
		const plans = plugin.settings.upcomingShowPlans
			? upcomingPlans(plugin.planOperations.getPlans(), now)
			: [];
		const all = mergeUpcoming(events, plans);
		const near = thisAndNextWeek(all, now, plugin.settings.weekStartsOn);
		// Overdue tasks are never trimmed: they're the point of the
		// section once they exist, and capping the list at ten would let a
		// busy fortnight hide the thing you're late for.
		const { overdue, rest } = splitOverdue(near);
		const groups = groupEventsByPeriod(
			rest,
			(i) => (i.kind === "plan" ? i.plan.date : i.event.date),
			now,
			{ weekStartsOn: plugin.settings.weekStartsOn }
		);
		return {
			overdue,
			groups,
			shownCount: rest.length,
			// Only what's beyond next week — nothing inside the window is
			// held back. Counting against the whole list is what the "View
			// all" link at the bottom is for.
			hiddenCount: all.length - near.length,
			total: all.length,
		};
		// `version` is the dependency on purpose: it's the invalidation
		// signal, and the read it guards (getEvents) has no stable identity
		// of its own to depend on. See useVaultVersion.
	}, [version, plugin]);

	// Same resolution the plan pages use — wikilinks to display names, with
	// a dead link falling back to its own text. Summarised rather than
	// joined: a dashboard row has one line for the roster, and a party of
	// six would otherwise push the name of the event off it.
	const peopleNames = (e: EventInfo) =>
		e.people.length > 0
			? summarisePeople(
					resolvePeopleInfo(plugin.app, e.file.path, e.people)
			  )
			: "";

	const openEvent = (event: EventInfo) => {
		// No onChange callback that re-renders: the write is what tells us.
		new EventViewModal(plugin.app, plugin, event).open();
	};

	/**
	 * Ticking a task off is the only way it leaves this list, so the row
	 * offers it directly — in the slot the countdown would have used,
	 * since "in 3 days" is the less useful of the two on something you're
	 * being asked to do.
	 *
	 * Behind a confirmation because the row itself opens the event, and a
	 * mis-aimed tap next to that shouldn't quietly close something off.
	 */
	const doneAction = (event: EventInfo) => ({
		icon: "check",
		label: "Done",
		ariaLabel: `Mark ${event.name} as done`,
		onClick: (e: MouseEvent) => {
			e.stopPropagation();
			new ConfirmModal(plugin.app, {
				title: "Mark as done?",
				message: `"${event.name}" will come off your dashboard.`,
				confirmLabel: "Mark as done",
				onConfirm: async () => {
					await plugin.eventOperations.setStatus(event.file, "done");
				},
				tone: "normal",
			}).open();
		},
	});

	const eventRow = (event: EventInfo) => (
		<UpcomingRow
			key={event.file.path}
			{...eventRowFields(event, new Date(), peopleNames(event), {
				// The dashboard is a "what's next" view — anything inside a
				// fortnight reads better by weekday.
				conversational: true,
				// And a section already grouped into "This week" / "Next
				// week" doesn't need "This"/"Next" on every row inside those
				// groups too — "Thursday" on its own says enough.
				bareWeekday: true,
				viewerZone: displayZone(plugin.settings.displayTimezone),
			})}
			{...(event.type === "task" ? { action: doneAction(event) } : {})}
			onClick={() => openEvent(event)}
		/>
	);

	/**
	 * A plan in the same shape as an event row.
	 *
	 * Built here rather than through eventRowFields: a plan has no type and
	 * no time, and the fields it does share are read off different names. A
	 * leading emoji in its own title stands in as the icon, which is how the
	 * Plans section below already draws one.
	 */
	const planRow = (plan: PlanInfo) => {
		const when = upcomingWhen(plan.date, new Date(), {
			conversational: true,
		});
		const lead = splitLeadingEmoji(plan.name);
		const people = resolvePeopleInfo(
			plugin.app,
			plan.file.path,
			plan.members
		);
		return (
			<UpcomingRow
				key={plan.file.path}
				icon={lead?.emoji ?? "🗺️"}
				date={when.date}
				name={lead ? lead.rest : plan.name}
				// Bare names: UpcomingRow puts the bullet in front of the
				// suffix itself, and one here made two.
				suffix={people.length > 0 ? summarisePeople(people) : ""}
				relative={when.relative}
				tone={when.tone}
				onClick={() =>
					new PlanGlanceModal(
						plugin.app,
						plan,
						() => void plugin.openContactPage(plan.file),
						(hidden) =>
							plugin.planOperations.setHiddenFrom(
								plan.file,
								"upcoming",
								hidden
							)
					).open()
				}
			/>
		);
	};

	const row = (entry: UpcomingEntry) =>
		entry.kind === "plan" ? planRow(entry.plan) : eventRow(entry.event);

	return (
		<div className="dashboard-section dashboard-upcoming-section">
			<div className="dashboard-section-header">
				<h3>📌 Upcoming</h3>
				<div className="dashboard-section-buttons">
					<button
						className="callander-button"
						onClick={() =>
							new EventModal(plugin.app, plugin, null).open()
						}
					>
						Add event
					</button>
					<button
						className="callander-button"
						onClick={() => void plugin.activateEvents(undefined, { here: true })}
					>
						See all
					</button>
					<button
						className="callander-button button-icon dashboard-section-settings"
						aria-label="Upcoming settings"
						onClick={() =>
							new UpcomingSettingsModal(plugin.app, plugin).open()
						}
					>
						<Icon name="settings-2" />
					</button>
				</div>
			</div>

			<TimezoneBanner />

			{total === 0 && (
				<div className="section-helper-text">
					Nothing coming up. Add an event — a birthday, a booking,
					anything worth keeping in view.
				</div>
			)}

			{total > 0 && shownCount === 0 && overdue.length === 0 && (
				<div className="section-helper-text">
					Nothing this week or next.
				</div>
			)}

			{/* Above the weeks, because it's already late — and under its
			    own heading rather than mixed into "This week", where a
			    task from a fortnight ago would read as though it were
			    still to come. */}
			{overdue.length > 0 && (
				<div className="dashboard-upcoming-timeline">
					<div className="contact-timeline-year dashboard-overdue-heading">
						Overdue
					</div>
					{overdue.map((entry) => row(entry))}
				</div>
			)}

			{/* Grouped, but only ever into "This week", "Next week" and the
			    undated group — the section reaches no further than that, so
			    the headings the Events page uses for months never appear. */}
			{shownCount > 0 && (
				<div className="dashboard-upcoming-timeline">
					{groups.map((group) => (
						// Fragments, not wrapper divs: headings and rows must
						// stay direct children, or
						// `.contact-timeline-year:first-child` — which drops
						// the top margin on the first heading only — matches
						// every one of them and the groups run together.
						<Fragment key={group.key || "undated"}>
							<div className="contact-timeline-year">
								{group.label}
							</div>
							{group.items.map((entry) => row(entry))}
						</Fragment>
					))}
				</div>
			)}

			{hiddenCount > 0 && (
				<div
					className="section-helper-text dashboard-row-clickable"
					onClick={() => void plugin.activateEvents(undefined, { here: true })}
				>
					View all upcoming events
				</div>
			)}
		</div>
	);
}
