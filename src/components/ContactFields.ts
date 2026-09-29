import type FriendTracker from "@/main";
import { capitalize } from "@/utils/text";

export function createRelationshipInput(
	container: HTMLElement,
	plugin: FriendTracker,
	value: string = "",
	onChange?: (value: string) => void | Promise<void>
) {
	const input = container.createEl("input", {
		cls: "callander-modal-input",
		attr: {
			type: "text",
			value: value || "",
			placeholder: "Friend, family, colleague, etc.",
			list: "relationship-types",
			autocomplete: "on",
			role: "combobox",
			"aria-autocomplete": "list",
		},
	});

	updateRelationshipDatalist(input, plugin);
	// Add input event listener for immediate feedback
	input.addEventListener("input", () => {
		updateRelationshipDatalist(input, plugin, input.value);
	});

	if (onChange) {
		input.addEventListener("change", () => {
			void onChange(input.value);
		});
	}

	return input;
}

/**
 * The suggestions a relationship input offers, as the `relationship-types`
 * datalist in the input's own document — made there if it isn't yet.
 *
 * Any input that says `list="relationship-types"` needs it: the contact
 * page's About field did, but only Add friend ever made the list, so until
 * that form had been opened in a session the page offered nothing.
 */
export function updateRelationshipDatalist(
	input: HTMLInputElement,
	plugin: FriendTracker,
	filter?: string
) {
	const doc = input.ownerDocument;
	let datalist = doc.getElementById(
		"relationship-types"
	) as HTMLDataListElement | null;
	if (!datalist) {
		datalist = doc.body.createEl("datalist", {
			attr: { id: "relationship-types" },
		});
	}
	datalist.empty();
	for (const type of plugin.settings.relationshipTypes) {
		if (filter && !type.includes(filter.toLowerCase())) continue;
		datalist.createEl("option").text = capitalize(type);
	}
}

/**
 * Add a relationship typed into a form to the ones suggested next time,
 * once, however it was cased. Saves settings when it adds one.
 */
export function rememberRelationshipType(plugin: FriendTracker, value: string) {
	const relationship = value.trim().toLowerCase();
	const types = plugin.settings.relationshipTypes;
	if (!relationship || types.includes(relationship)) return;
	plugin.settings.relationshipTypes = [
		...new Set(types.filter((type) => type.toLowerCase() !== relationship)),
		relationship,
	];
	void plugin.saveSettings();
}
