import { INTEREST_CATEGORIES } from "@/constants";
import type { Interest } from "@/types";
import { Icon } from "@/ui/components/Icon";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";

/**
 * What they're into, grouped by category in the fixed category order.
 *
 * The ordering is the constant's, not the data's: interests accumulate in
 * whatever order they were added, and reading them back grouped is the only
 * way a long list stays scannable.
 *
 * Categories are normalised by the caller, which owns the legacy-key
 * mapping — this only asks which bucket each one landed in.
 */
export function InterestsSection({
	store,
	interests,
	categoryOf,
	onRemove,
	onAdd,
}: {
	store: ViewStore;
	interests: () => Interest[];
	categoryOf: (interest: Interest) => string;
	onRemove: (index: number) => void;
	onAdd: () => void;
}) {
	useViewRevision(store);
	const all = interests();

	return (
		<div className="contact-interests-section">
			{all.length === 0 && (
				<div className="section-helper-text">
					What they're into — books, music, teams, the food they love.
					Handy for gifts, plans, and picking a conversation back up.
				</div>
			)}

			{INTEREST_CATEGORIES.map((cat) => {
				const items = all
					.map((interest, index) => ({ interest, index }))
					.filter(({ interest }) => categoryOf(interest) === cat.id);
				if (items.length === 0) return null;

				return (
					<div className="contact-idea-group" key={cat.id}>
						<div className="contact-idea-group-header">
							{`${cat.emoji} ${cat.label}`}
						</div>
						<div className="contact-interest-chips">
							{items.map(({ interest, index }) => (
								<div
									className="contact-interest-chip"
									key={index}
								>
									<span>{interest.text}</span>
									{interest.detail && (
										<span className="contact-interest-chip-detail">
											{` · ${interest.detail}`}
										</span>
									)}
									<button
										className="contact-interest-chip-remove"
										aria-label={`Remove ${interest.text}`}
										onClick={() => onRemove(index)}
									>
										<Icon name="x" />
									</button>
								</div>
							))}
						</div>
					</div>
				);
			})}

			{/* Capture goes through the modal, below the list. */}
			<div className="contact-section-footer">
				<button className="callander-button" onClick={onAdd}>
					Add interest
				</button>
			</div>
		</div>
	);
}
