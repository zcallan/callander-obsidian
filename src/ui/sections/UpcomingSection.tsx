import { Fragment, useMemo } from "react";
import type { EventInfo } from "@/types";
import { eventRowFields } from "@/utils/eventRow";
import { upcomingItems, thisAndNextWeek } from "@/utils/upcomingList";
import { groupEventsByPeriod } from "@/utils/eventGroups";
import { EventModal } from "@/modals/EventModal";
import { EventViewModal } from "@/modals/EventViewModal";
import { usePlugin } from "@/ui/PluginContext";
import { useVaultVersion } from "@/ui/useVaultData";
import { UpcomingRow } from "@/ui/components/UpcomingRow";
import { resolvePeopleNames } from "@/utils/people";

/** Beyond this the list stops being a glance and starts being the Events page. */
const MAX_ROWS = 10;

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

	const { shown, hiddenCount, total } = useMemo(() => {
		const now = new Date();
		const all = upcomingItems(plugin.eventOperations.getEvents(), now);
		const near = thisAndNextWeek(all, now);
		const visible = near.slice(0, MAX_ROWS);
		return {
			shown: visible,
			hiddenCount: all.length - visible.length,
			total: all.length,
		};
		// `version` is the dependency on purpose: it's the invalidation
		// signal, and the read it guards (getEvents) has no stable identity
		// of its own to depend on. See useVaultVersion.
	}, [version, plugin]);

	// Same resolution the plan pages use — wikilinks to display names, with
	// a dead link falling back to its own text.
	const peopleNames = (e: EventInfo) =>
		e.people.length > 0
			? resolvePeopleNames(plugin.app, e.file.path, e.people).join(", ")
			: "";

	const openEvent = (event: EventInfo) => {
		// No onChange callback that re-renders: the write is what tells us.
		new EventViewModal(plugin.app, plugin, event, () => undefined).open();
	};

	const row = (event: EventInfo) => (
		<UpcomingRow
			key={event.file.path}
			{...eventRowFields(event, new Date(), peopleNames(event), {
				// The dashboard is a "what's next" view — anything inside a
				// fortnight reads better by weekday.
				conversational: true,
			})}
			onClick={() => openEvent(event)}
		/>
	);

	return (
		<div className="dashboard-section dashboard-upcoming-section">
			<div className="dashboard-section-header">
				<h3>📌 Upcoming</h3>
				<div className="dashboard-section-buttons">
					<button
						className="callander-button"
						onClick={() =>
							new EventModal(
								plugin.app,
								plugin,
								null,
								() => undefined
							).open()
						}
					>
						Add event
					</button>
					<button
						className="callander-button"
						onClick={() => void plugin.activateEvents()}
					>
						See all
					</button>
				</div>
			</div>

			{total === 0 && (
				<div className="section-helper-text">
					Nothing coming up. Add an event — a birthday, a booking,
					anything worth keeping in view.
				</div>
			)}

			{total > 0 && shown.length === 0 && (
				<div className="section-helper-text">
					Nothing this week or next.
				</div>
			)}

			{/* Grouped, but only ever into "This week", "Next week" and the
			    undated group — the section reaches no further than that, so
			    the headings the Events page uses for months never appear. */}
			{shown.length > 0 && (
				<div className="dashboard-upcoming-timeline">
					{groupEventsByPeriod(
						shown.map((i) => i.event),
						(e) => e.date,
						new Date()
					).map((group) => (
						// Fragments, not wrapper divs: headings and rows must
						// stay direct children, or
						// `.contact-timeline-year:first-child` — which drops
						// the top margin on the first heading only — matches
						// every one of them and the groups run together.
						<Fragment key={group.key || "undated"}>
							<div className="contact-timeline-year">
								{group.label}
							</div>
							{group.items.map((event) => row(event))}
						</Fragment>
					))}
				</div>
			)}

			{hiddenCount > 0 && (
				<div
					className="section-helper-text dashboard-row-clickable"
					onClick={() => void plugin.activateEvents()}
				>
					+{hiddenCount} more on the Events page
				</div>
			)}
		</div>
	);
}
