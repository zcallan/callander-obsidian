import type { PlanSimpleItem } from "@/types";
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
}: {
	store: ViewStore;
	/** The plan's stays, re-read on every bump. */
	items: () => PlanSimpleItem[];
	/** Opens the add/edit modal — null index adds. */
	onOpen: (index: number | null, item: PlanSimpleItem | null) => void;
}) {
	useViewRevision(store);
	const rows = items();

	return (
		<div className="contact-ideas-section plan-items-section">
			{rows.length === 0 && (
				<div className="section-helper-text">
					Where you're staying — the Airbnb, a hotel, someone's place.
				</div>
			)}

			{rows.map((item, index) => (
				// Index as key: these rows have no stable id of their own, and
				// the list is only ever rebuilt wholesale from frontmatter —
				// there's no reorder or in-place edit for a keyed identity to
				// preserve. Same reasoning the modal uses to address them.
				<StayRow
					key={index}
					item={item}
					onClick={() => onOpen(index, item)}
				/>
			))}

			<div className="contact-section-footer">
				<button
					className="callander-button"
					onClick={() => onOpen(null, null)}
				>
					<Icon name="plus" />
					<span>Add accommodation</span>
				</button>
			</div>
		</div>
	);
}
