import { Icon } from "@/ui/components/Icon";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";

/** A member as the chip needs them: resolved name, and the note if it exists. */
export interface PlanMemberChip {
	display: string;
	/** Vault path when the entry resolved to a real note, else null. */
	path: string | null;
	/** Index into the stored list, which is what removal addresses. */
	index: number;
}

/**
 * Who's coming.
 *
 * Confirmed people first, then anyone still unconfirmed in their own group —
 * an invite that hasn't been answered is a different fact from someone
 * who's in, and running them together would overstate the guest list.
 *
 * Resolution to display names happens in the view, which owns the metadata
 * cache; this only renders what it's handed.
 */
export function PlanMembersSection({
	store,
	yourName,
	members,
	unconfirmed,
	onOpen,
	onRemove,
	onConfirm,
	onRemoveUnconfirmed,
	onAdd,
}: {
	store: ViewStore;
	/** Shown first and unremovable — you're on your own plan by definition. */
	yourName: string;
	members: () => PlanMemberChip[];
	unconfirmed: () => PlanMemberChip[];
	onOpen: (path: string) => void;
	onRemove: (index: number) => void;
	onConfirm: (index: number) => void;
	onRemoveUnconfirmed: (index: number) => void;
	onAdd: () => void;
}) {
	useViewRevision(store);
	const confirmed = members();
	const pending = unconfirmed();

	const name = (chip: PlanMemberChip) =>
		chip.path ? (
			<span
				className="plan-chip-name"
				onClick={() => onOpen(chip.path as string)}
			>
				{chip.display}
			</span>
		) : (
			<span>{chip.display}</span>
		);

	return (
		<div className="plan-members-body">
			<div className="contact-group-chips plan-member-chips">
				{yourName && (
					<span className="contact-group-chip readonly plan-member-chip">
						<span>{yourName}</span>
						<span className="plan-chip-muted">(you)</span>
					</span>
				)}
				{confirmed.map((chip) => (
					<span
						key={chip.index}
						className="contact-group-chip readonly plan-member-chip"
					>
						{name(chip)}
						<span
							className="contact-member-remove"
							aria-label="Remove from plan"
							onClick={() => onRemove(chip.index)}
						>
							✕
						</span>
					</span>
				))}
			</div>

			{pending.length > 0 && (
				<>
					<div className="plan-member-sublabel">Unconfirmed</div>
					<div className="contact-group-chips plan-member-chips">
						{pending.map((chip) => (
							<span
								key={chip.index}
								className="contact-group-chip readonly plan-member-chip plan-member-unconfirmed"
							>
								{name(chip)}
								<span
									className="plan-chip-confirm"
									aria-label="Confirm — they're in"
									onClick={() => onConfirm(chip.index)}
								>
									✓
								</span>
								<span
									className="contact-member-remove"
									aria-label="Remove"
									onClick={() =>
										onRemoveUnconfirmed(chip.index)
									}
								>
									✕
								</span>
							</span>
						))}
					</div>
				</>
			)}

			<div className="plan-member-add-row">
				<button
					className="callander-button button-outlined"
					onClick={onAdd}
				>
					<Icon name="plus" />
					<span>Add person</span>
				</button>
			</div>
		</div>
	);
}
