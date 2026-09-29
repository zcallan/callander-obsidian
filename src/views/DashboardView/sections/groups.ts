import { setIcon } from "obsidian";
import { GroupModal } from "@/modals/GroupModal";
import { formatCount } from "@/utils/text";
import type { DashboardContext } from "@/views/DashboardView/context";
import { makeActivatable } from "@/components/activatable";

export function renderGroups(ctx: DashboardContext, container: HTMLElement) {
	const ops = ctx.plugin.contactOperations;
	const infos = ops.getGroupInfos(ctx.data.contacts);

	const section = container.createDiv({
		cls: "dashboard-section",
	});
	const header = section.createDiv({
		cls: "dashboard-section-header",
	});
	header.createEl("h3", { text: "👥 Groups" });
	const newButton = header.createEl("button", {
		cls: "callander-button",
		text: "New group",
	});
	newButton.addEventListener("click", () => {
		new GroupModal(ctx.app, ctx.plugin, null).open();
	});

	if (infos.length === 0) {
		section.createDiv({
			cls: "section-helper-text",
			text: "Sort friends into circles — Family, Basketball… Groups can hold their own ideas too.",
		});
		return;
	}

	for (const info of infos) {
		const count = ctx.data.contacts.filter((c) =>
			c.groups.includes(info.name)
		).length;
		const row = section.createDiv({ cls: "dashboard-row" });

		const label = row.createSpan({
			cls: "dashboard-row-clickable-label dashboard-group-label",
		});
		const dot = label.createSpan({ cls: "group-dot" });
		dot.style.backgroundColor =
			info.color ?? "var(--background-modifier-border)";
		label.createSpan({ text: ops.labelOf(info) });
		label.createSpan({
			cls: "dashboard-row-date",
			text: ` · ${formatCount(count, "member")}`,
		});
		const handleOpenGroup = async () => {
			const file =
				info.file ?? (await ops.ensureGroupFile(info.name));
			await ctx.openContact(file);
		};
		makeActivatable(label, () => void handleOpenGroup(), {
			role: "link",
			focusKey: `group:${info.name}`,
		});

		const manageButton = row.createEl("button", {
			cls: "callander-button button-icon dashboard-row-action",
			attr: { "aria-label": "Manage group" },
		});
		setIcon(manageButton, "settings-2");
		manageButton.addEventListener("click", () => {
			new GroupModal(ctx.app, ctx.plugin, info).open();
		});
	}
}
