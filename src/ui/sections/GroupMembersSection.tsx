import type { ContactWithCountdown } from "@/types";
import { formatFlexDate, parseFlexDate } from "@/utils/flexdate";
import { usePlugin } from "@/ui/PluginContext";
import { useVaultQuery } from "@/ui/useVaultData";
import { Icon } from "@/ui/components/Icon";

const NO_CONTACTS: ContactWithCountdown[] = [];

/**
 * Who's in a group.
 *
 * Reads through useVaultQuery rather than the view's ViewStore: membership
 * is a property of every *other* person's file, not of this one, so the
 * signal that it changed is the vault's, not this page's.
 */
export function GroupMembersSection({
	groupName,
	onOpen,
	onRemove,
	onAdd,
}: {
	groupName: () => string;
	onOpen: (path: string) => void;
	onRemove: (contact: ContactWithCountdown) => void;
	onAdd: (candidates: ContactWithCountdown[]) => void;
}) {
	const plugin = usePlugin();
	const contacts = useVaultQuery(
		() => plugin.contactOperations.getContacts(),
		NO_CONTACTS
	);
	const name = groupName();
	const members = contacts.filter((c) => c.groups.includes(name));

	return (
		<>
			<div className="contact-field-label">
				{`Members (${members.length})`}
			</div>

			<div className="group-member-list">
				{members.map((m) => {
					const met = parseFlexDate(m.met);
					return (
						<div className="group-member-row" key={m.file.path}>
							<div
								className="group-member-info"
								onClick={() => onOpen(m.file.path)}
							>
								<div className="group-member-name">
									{m.displayName}
								</div>
								{met && met.year !== null && (
									<div className="group-member-met">
										{`Met ${formatFlexDate(met)}`}
									</div>
								)}
							</div>
							<button
								className="callander-button button-icon button-danger"
								aria-label="Remove from group"
								onClick={() => onRemove(m)}
							>
								<Icon name="x" />
							</button>
						</div>
					);
				})}
			</div>

			<button
				className="callander-button button-outlined"
				onClick={() =>
					onAdd(contacts.filter((c) => !c.groups.includes(name)))
				}
			>
				Add member
			</button>
		</>
	);
}
