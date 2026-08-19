import { Icon } from "@/ui/components/Icon";

/** The person page's one destructive action, kept at the very bottom. */
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
