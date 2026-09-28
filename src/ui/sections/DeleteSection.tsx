import { Icon } from "@/ui/components/Icon";

/**
 * The person page's one destructive action, kept at the very bottom and set
 * apart by a divider.
 *
 * Deliberately not in the header with the other actions: it's the one
 * control there that destroys something, and putting it beside "Add idea"
 * makes a misclick cheap. Reaching it means scrolling past the whole page.
 */
export function DeleteSection({ onDelete }: { onDelete: () => void }) {
	return (
		<div className="contact-delete-section">
			<button
				className="callander-button contact-delete-button"
				onClick={onDelete}
			>
				<Icon name="trash-2" />
				<span>Delete</span>
			</button>
		</div>
	);
}
