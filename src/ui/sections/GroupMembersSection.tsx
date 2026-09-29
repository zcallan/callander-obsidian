import type { ContactWithCountdown } from "@/types";
import { formatFlexDate, parseFlexDate } from "@/utils/flexdate";
import { usePlugin } from "@/ui/PluginContext";
import { useVaultQuery } from "@/ui/useVaultData";
import { Icon } from "@/ui/components/Icon";
import { activatable } from "@/ui/a11y";

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

			{/* Pills, as a plan's members are. When they met, which the old
			    rows spelled out, rides along as the pill's tooltip. */}
			<div className="contact-group-chips plan-member-chips group-member-chips">
				{members.map((m) => {
					const met = parseFlexDate(m.met);
					return (
						<span
							key={m.file.path}
							className="contact-group-chip readonly plan-member-chip"
							title={
								met && met.year !== null
									? `Met ${formatFlexDate(met)}`
									: undefined
							}
						>
							<span
								{...activatable(
									() => onOpen(m.file.path),
									"plan-chip-name",
									{ role: "link", focusKey: `member:${m.file.path}` }
								)}
							>
								{m.displayName}
							</span>
							<span
								{...activatable(
									() => onRemove(m),
									"contact-member-remove",
									{ label: `Remove ${m.displayName} from the group` }
								)}
							>
								✕
							</span>
						</span>
					);
				})}
			</div>

			<div className="plan-member-add-row">
				<button
					className="callander-button button-outlined"
					onClick={() =>
						onAdd(contacts.filter((c) => !c.groups.includes(name)))
					}
				>
					<Icon name="plus" />
					<span>Add member</span>
				</button>
			</div>
		</>
	);
}
