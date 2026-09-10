import type { PlanSimpleItem } from "@/types";
import { staysInOrder } from "@/utils/stayShare";
import { Icon } from "@/ui/components/Icon";
import { StayRow } from "@/ui/components/StayRow";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";

/**
 * Where you're staying — the first plan section to move across to React.
 *
 * Reads through a stable accessor rather than taking the list as a prop.
 * The island is created once and never re-rendered from the outside (see
 * ContactPageView's `island`), so a list passed in as a prop would be
 * frozen at whatever it was on mount. The accessor closes over the view's
 * `contactData` and is re-run whenever the store bumps, which the view does
 * from the same place it used to redraw.
 *
 * Every mutation still goes through PlanSimpleItemModal, which writes and
 * bumps on the way out — so there's no local state here to keep in step,
 * and nothing to reconcile if the same plan is edited in another pane.
 */
export function AccommodationSection({
	store,
	items,
	onOpen,
	onCopy,
}: {
	store: ViewStore;
	/** The plan's stays, re-read on every bump. */
	items: () => PlanSimpleItem[];
	/** Opens the add/edit modal — null index adds. */
	onOpen: (index: number | null, item: PlanSimpleItem | null) => void;
	/** Every stay as text. */
	onCopy: () => void;
}) {
	useViewRevision(store);
	// Check-in order, not the order they were added — the same order the
	// copied text uses, so the list and the message agree. Each row keeps
	// its stored index, which is what an edit writes back through.
	const rows = staysInOrder(items());

	return (
		<div className="contact-ideas-section plan-items-section">
			{rows.length === 0 && (
				<div className="section-helper-text">
					Where you're staying — the Airbnb, a hotel, someone's place.
				</div>
			)}

			{rows.map(({ stay, index }) => (
				// The stored index as key, not the display position: it's the
				// row's only stable identity, and it's what the modal edits
				// through. Keying on the sorted position would hand a row's
				// state to whichever stay took its place after a date change.
				<StayRow
					key={index}
					item={stay}
					onClick={() => onOpen(index, stay)}
				/>
			))}

			<div className="contact-section-footer plan-timeline-footer plan-list-footer">
				<button
					className="callander-button"
					onClick={() => onOpen(null, null)}
				>
					<Icon name="plus" />
					<span>Add accommodation</span>
				</button>
				{/* Nothing to copy before a stay exists. Set apart from the
				    add the same way the timeline's is — it acts on the whole
				    section rather than adding to it. */}
				{rows.length > 0 && (
					<button
						className="callander-button plan-timeline-copy"
						onClick={onCopy}
					>
						<Icon name="copy" />
						<span>Copy as text</span>
					</button>
				)}
			</div>
		</div>
	);
}
