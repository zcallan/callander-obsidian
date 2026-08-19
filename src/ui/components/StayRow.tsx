import { ACCOMMODATION_EMOJI, BOOKING_STATES } from "@/constants";
import { formatStayHours, nightsLabel, startsWithEmoji } from "@/utils/planFormat";
import type { PlanSimpleItem } from "@/types";

/**
 * One accommodation row: name • nights, then hours • booking, with the
 * second group pinned right on desktop and wrapped to its own line on a
 * phone.
 *
 * Only the name shrinks. Everything else is short and load-bearing — a
 * truncated "$40" or "Booke…" tells you nothing — so the meta spans refuse
 * to shrink and the name takes the squeeze, ellipsis and all.
 *
 * Uses the existing global classes rather than a co-located `.module.css`,
 * against the usual rule for new components. These ~40 rules carry the
 * phone/desktop split, the ellipsis behaviour and the row divider, and were
 * tuned against real content; porting the markup and rewriting the CSS in
 * one step would leave no way to tell which half broke a layout. The module
 * belongs in the same change that retires the imperative `renderStayRow`.
 */
export function StayRow({
	item,
	onClick,
}: {
	item: PlanSimpleItem;
	onClick: () => void;
}) {
	const booking = BOOKING_STATES.find((b) => b.id === item.booked);
	// Still needs booking: that's the answer this row is scanning for, so it
	// stands alone rather than sharing the line with hours that aren't
	// confirmed yet either.
	const isTodo = booking?.id === "todo";
	const hours = formatStayHours(item.checkIn, item.checkOut);
	const hoursShown = !!hours && !isTodo;
	const bookingShown = !!booking && booking.id !== "none";
	const icon = (item.stay && ACCOMMODATION_EMOJI[item.stay]) || "🛏️";

	return (
		<div
			className="contact-idea-item plan-clickable-row plan-stay-list-item"
			onClick={onClick}
		>
			<div className="contact-idea-text plan-stay-row">
				{/* Name + nights in their own non-wrapping group. Without this,
				    a phone can wrap *between* them instead of at the intended
				    break below — flexbox is free to start a new line wherever
				    a row's content overflows, not only where a forced break
				    sits. Grouping them removes that option: the pair wraps as
				    one unit or not at all. */}
				<div className="plan-stay-group">
					<span className="plan-stay-name">
						{!startsWithEmoji(item.text) && (
							<span className="plan-item-type-icon">{icon}</span>
						)}
						<span>{item.text}</span>
					</span>
					{!!item.nights && (
						<span className="plan-stay-meta">
							• {nightsLabel(item.nights)}
						</span>
					)}
				</div>

				{/* Forces the phone-only wrap between the two groups. Inert on
				    desktop (`display: none`), where the row stays one line. */}
				<span className="plan-stay-break" />

				{/* Only rendered when there's something to put in it, so an
				    empty group can't leave a stray forced break with nothing
				    after it. */}
				{(hoursShown || bookingShown) && (
					<div className="plan-stay-group">
						{hoursShown && (
							<span className="plan-stay-hours">{hours}</span>
						)}
						{bookingShown && (
							<>
								{/* The bullet is its own flex child, not text
								    baked onto the chip — that's what makes its
								    gap on both sides come from the same `gap`
								    the rest of the row uses, rather than a flex
								    gap on one side and a typed space on the
								    other. Only there when hours actually
								    rendered before it: with nothing to separate
								    from, a bullet is a stray dot. */}
								{hoursShown && (
									<span className="plan-stay-sep">•</span>
								)}
								<span
									className={`plan-stay-meta plan-stay-booking${
										isTodo ? " plan-stay-booking-todo" : ""
									}`}
								>
									{/* "Need to book" rather than
									    BOOKING_STATES' own "To book" — that
									    shorter label reads fine as a travel
									    row's trailing chip, but stated as the
									    one thing this row still needs, "Need
									    to" is the clearer prompt. */}
									{isTodo ? "Need to book" : booking.emoji}
									{/* A separate span rather than a JS device
									    check, so it follows the same
									    `.is-phone` CSS switch as the rest of
									    this row's layout instead of a second
									    source of truth. Booked hides it on
									    desktop — the tick alone says it — but
									    keeps it on a phone, where this already
									    has its own full-width line. "To book"
									    keeps its emoji everywhere instead. */}
									<span
										className={
											isTodo
												? "plan-stay-booking-suffix"
												: "plan-stay-booking-suffix plan-stay-booking-suffix-desktop-hidden"
										}
									>
										{isTodo
											? ` • ${booking.emoji}`
											: ` ${booking.label}`}
									</span>
								</span>
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
