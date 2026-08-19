import { BOOKING_STATES } from "@/constants";
import {
	formatItemCost,
	formatItemTime,
	formatStayHours,
	nightsSummary,
	startsWithEmoji,
} from "@/utils/planFormat";
import type { PlanTimelineEntry } from "@/types";
import { Icon } from "@/ui/components/Icon";

/**
 * One dated row of the itinerary — an idea, a travel leg or a stay.
 *
 * Tapping the row opens it, which is the only path on a phone; the Edit and
 * Delete buttons are a desktop hover shortcut, hidden on touch by CSS.
 */
export function TimelineEntryRow({
	entry,
	people,
	onOpen,
	onEdit,
	onDelete,
}: {
	entry: PlanTimelineEntry;
	/** Already shortened by the caller, which owns the plan's roster. */
	people: string;
	onOpen: () => void;
	onEdit: () => void;
	onDelete: () => void;
}) {
	// A stay has no clock time — it's simply where the day ends.
	const isStay = entry.source === "accommodation";
	const showEmoji = entry.emoji && !startsWithEmoji(entry.text);

	const metaBits: string[] = [];
	if (entry.duration) metaBits.push(entry.duration);
	// Answers "when do we leave?" without a second timeline row.
	if (entry.nights) metaBits.push(nightsSummary(entry.date, entry.nights));
	if (entry.cost !== undefined) metaBits.push(formatItemCost(entry.cost));

	// Only the state that still needs chasing earns a spot here. "Booked"
	// and "Not needed" are resting states — the Accommodation section and
	// the modals are where you go to check them.
	const booking = BOOKING_STATES.find((b) => b.id === entry.booked);
	const todo = booking?.id === "todo" ? booking : null;

	const stayHours = formatStayHours(entry.checkIn, entry.checkOut);
	const place = entry.address ?? entry.location;

	return (
		<div
			className={`contact-timeline-item plan-timeline-item timeline-${entry.source}`}
			onClick={onOpen}
		>
			<div
				className={`contact-timeline-dot timeline-dot-${entry.source}`}
			/>

			{(isStay || entry.time) && (
				<div className="contact-timeline-date">
					{isStay ? "Sleeping at" : formatItemTime(entry.time ?? "")}
				</div>
			)}

			<div className="contact-timeline-text">
				{showEmoji ? `${entry.emoji} ${entry.text}` : entry.text}
				{/* A draft says so, in its own colour — it's on the timeline
				    because it has a day, not because it's a decision anyone
				    has made yet. */}
				{entry.source === "draft" && (
					<span className="plan-timeline-draft-tag"> • Draft</span>
				)}
				{metaBits.length > 0 && (
					<span className="plan-travel-meta">
						{`  ·  ${metaBits.join("  ·  ")}`}
					</span>
				)}
				{/* Its own span rather than another metaBit, so "Need to
				    book" can be coloured without recolouring the line. */}
				{todo && (
					<span className="plan-travel-meta">
						<span>{"  ·  "}</span>
						<span className="plan-timeline-booking-todo">
							{`${todo.emoji} Need to book`}
						</span>
					</span>
				)}
			</div>

			{people && <div className="plan-travel-people">{people}</div>}

			{/* A stay calls it an address, an idea calls it a location —
			    never both, so one line covers either. Plain text: the row is
			    already a target that opens the read view, where it gets its
			    Map button. */}
			{place && <div className="plan-entry-place">📍 {place}</div>}

			{stayHours && (
				<div className="plan-entry-place">🔑 {stayHours}</div>
			)}

			{entry.notes && (
				<div className="plan-stay-notes">📝 {entry.notes}</div>
			)}

			{/* Desktop hover shortcuts, so editing doesn't need the read view
			    first. CSS hides these on touch, where tapping the row is the
			    only path. */}
			<div className="contact-timeline-actions">
				<button
					className="callander-button"
					aria-label="Edit"
					onClick={(e) => {
						e.stopPropagation();
						onEdit();
					}}
				>
					<Icon name="pencil" />
					<span>Edit</span>
				</button>
				<button
					className="callander-button button-icon button-danger"
					aria-label="Delete"
					onClick={(e) => {
						e.stopPropagation();
						onDelete();
					}}
				>
					<Icon name="trash-2" />
				</button>
			</div>
		</div>
	);
}
