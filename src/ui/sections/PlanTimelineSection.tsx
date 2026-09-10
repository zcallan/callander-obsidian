import { Fragment } from "react";
import type { PlanTimelineEntry } from "@/types";
import {
	buildTimelineDays,
	timelineRowCount,
	LONG_TIMELINE_ROWS,
} from "@/utils/planTimeline";
import { formatTimelineDay } from "@/utils/planFormat";
import { Icon } from "@/ui/components/Icon";
import { TimelineEntryRow } from "@/ui/components/TimelineEntryRow";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";

/**
 * The section's actions. Sits at the top, and repeats at the foot of an
 * itinerary long enough that the top one has scrolled away.
 *
 * Copy as text is here rather than in the section header, where it used to
 * be: the header now folds, and a control that disappears with the section
 * it belongs to is easier to find than one competing with the chevron for
 * the same corner. Only the top row offers it — one copy of the whole
 * timeline is one button, however long the list.
 */
function AddRow({
	extraCls = "",
	onAddItem,
	onAddTravel,
	onCopy,
}: {
	extraCls?: string;
	onAddItem: () => void;
	onAddTravel: () => void;
	onCopy?: () => void;
}) {
	return (
		<div
			className={`contact-section-footer plan-timeline-footer ${extraCls}`.trim()}
		>
			{/* "Add to timeline" rather than "Add item": the section is
			    already called Timeline, and this is the same phrase a quick
			    idea uses to get here — one verb for one destination. */}
			<button className="callander-button" onClick={onAddItem}>
				<Icon name="plus" />
				<span>Add to timeline</span>
			</button>
			<button className="callander-button" onClick={onAddTravel}>
				<Icon name="plus" />
				<span>Add travel</span>
			</button>
			{onCopy && (
				<button
					className="callander-button plan-timeline-copy"
					onClick={onCopy}
				>
					<Icon name="copy" />
					<span>Copy as text</span>
				</button>
			)}
		</div>
	);
}

/** A day in the plan's range with nothing on it yet. */
function EmptyDayRow({
	day,
	onAddItem,
	onAddTravel,
}: {
	day: string;
	onAddItem: (day: string) => void;
	onAddTravel: (day: string) => void;
}) {
	return (
		<div className="contact-timeline-item plan-timeline-empty">
			{/* Its own span so the muted/italic treatment lands on the words
			    rather than the row: the row's opacity would dim the buttons
			    with it, and a child can't opt out of a parent's opacity. */}
			<span className="plan-timeline-empty-text">No plans yet</span>
			{/* Desktop only, like the row actions — CSS hides these on touch,
			    where the footer buttons are the path. The day rides through
			    as a prefill, so filling a blank day doesn't mean picking the
			    date back out of a dropdown. */}
			<div className="contact-timeline-actions plan-timeline-empty-actions">
				<button
					className="callander-button"
					aria-label="Add to timeline"
					onClick={(e) => {
						e.stopPropagation();
						onAddItem(day);
					}}
				>
					<Icon name="plus" />
					<span>Add to timeline</span>
				</button>
				<button
					className="callander-button"
					aria-label="Add travel"
					onClick={(e) => {
						e.stopPropagation();
						onAddTravel(day);
					}}
				>
					<Icon name="plus" />
					<span>Add travel</span>
				</button>
			</div>
		</div>
	);
}

/**
 * The plan as an itinerary: every dated item across ideas, travel and
 * accommodation, grouped by day, earliest first.
 *
 * Undated ideas go above the schedule, not below it — an undated idea is
 * the one thing here still waiting on a decision, and burying it under the
 * itinerary is how it gets forgotten.
 */
export function PlanTimelineSection({
	store,
	entries,
	undated,
	rangeDays,
	shortenPeople,
	onOpen,
	onEdit,
	onDelete,
	onAddItem,
	onAddTravel,
	onCopy,
}: {
	store: ViewStore;
	entries: () => PlanTimelineEntry[];
	undated: () => PlanTimelineEntry[];
	/** Every day of an exact start–end span, or empty when there isn't one. */
	rangeDays: () => string[];
	shortenPeople: (people: string) => string;
	onOpen: (entry: PlanTimelineEntry) => void;
	onEdit: (entry: PlanTimelineEntry) => void;
	onDelete: (entry: PlanTimelineEntry) => void;
	onAddItem: (day?: string) => void;
	onAddTravel: (day?: string) => void;
	/** Opens the share sheet for the whole itinerary. */
	onCopy: () => void;
}) {
	useViewRevision(store);
	const dated = entries();
	const loose = undated();
	const days = buildTimelineDays(dated, rangeDays());
	const empty = days.length === 0 && loose.length === 0;

	const row = (entry: PlanTimelineEntry, key: string) => (
		<TimelineEntryRow
			key={key}
			entry={entry}
			people={entry.people ? shortenPeople(entry.people) : ""}
			onOpen={() => onOpen(entry)}
			onEdit={() => onEdit(entry)}
			onDelete={() => onDelete(entry)}
		/>
	);

	return (
		<div className="contact-ideas-section plan-items-section">
			{empty && (
				<div className="section-helper-text">
					Give an idea, travel leg or stay a date and it lands here in
					order — your itinerary as it firms up.
				</div>
			)}

			{!empty && (
				<>
					{/* Always at the top now, because Copy as text lives in
					    it and has to be reachable whatever the length. The
					    repeat at the foot is what's conditional. */}
					<AddRow
						extraCls="plan-timeline-footer-top"
						onAddItem={() => onAddItem()}
						onAddTravel={() => onAddTravel()}
						onCopy={onCopy}
					/>

					<div className="contact-timeline plan-timeline">
						{loose.length > 0 && (
							<>
								<div className="contact-timeline-year plan-timeline-day plan-timeline-needs-date">
									Needs date
								</div>
								{loose.map((entry, i) =>
									row(entry, `undated-${i}`)
								)}
							</>
						)}

						{/* Fragments, not wrapper divs: the day headings and
						    rows must stay direct children of
						    .contact-timeline, whose
						    `.contact-timeline-year:first-child` rule drops
						    the top margin on the first heading only. Nested
						    in a wrapper, every heading would match it. */}
						{days.map(({ day, entries: dayEntries }) => (
							<Fragment key={day}>
								<div className="contact-timeline-year plan-timeline-day">
									{formatTimelineDay(day)}
								</div>
								{dayEntries.length > 0 ? (
									dayEntries.map((entry, i) =>
										row(entry, `${day}-${i}`)
									)
								) : (
									<EmptyDayRow
										day={day}
										onAddItem={onAddItem}
										onAddTravel={onAddTravel}
									/>
								)}
							</Fragment>
						))}
					</div>
				</>
			)}

			{/* Repeated at the foot only when the itinerary is long enough
			    that the top row has scrolled out of reach. An empty timeline
			    has no top row, so it falls back to this one. */}
			{(empty ||
				timelineRowCount(days, loose.length) > LONG_TIMELINE_ROWS) && (
				<AddRow
					onAddItem={() => onAddItem()}
					onAddTravel={() => onAddTravel()}
				/>
			)}
		</div>
	);
}
