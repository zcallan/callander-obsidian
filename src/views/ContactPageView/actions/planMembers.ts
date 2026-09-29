import { TFile } from "obsidian";
import type { PlanMemberChip } from "@/ui/sections/PlanMembersSection";
import { AddPlanMemberModal } from "@/modals/AddPlanMemberModal";
import { shortenPeopleList } from "@/utils/nameFormat";
import { resolvePeopleInfo, type PersonInfo } from "@/utils/people";
import { asArray, toText } from "@/utils/fm";
import { saveModel } from "@/views/ContactPageView/persistence";
import type { PageContext } from "@/views/ContactPageView/context";
import type { ContactPageModel } from "@/views/ContactPageView/model";

/**
 * This plan's members as display info — see resolvePeopleInfo, which does
 * the resolving. Kept as a method so planMemberDisplays and
 * planShortNameOverrides share one source and can never drift apart.
 *
 * Distinct from resolvePlanMembers() below, which resolves to TFiles —
 * this resolves to the display info those files' frontmatter holds.
 */
export function planMemberInfo(
	ctx: PageContext,
	model: ContactPageModel,
	list?: string[]
): PersonInfo[] {
	const members = list ?? asArray(model.data.members).map(String);
	return resolvePeopleInfo(ctx.app, model.file?.path ?? "", members);
}

/** Member display names — resolved contacts use displayName, guests as-is */
export function planMemberDisplays(
	ctx: PageContext,
	model: ContactPageModel,
	list?: string[]
): string[] {
	return planMemberInfo(ctx, model, list).map((m) => m.displayName);
}

/** shortName overrides for shortenPeopleList — see shortNameOverrides. */
export function planShortNameOverrides(
	ctx: PageContext,
	model: ContactPageModel,
	list?: string[]
): Map<string, string> {
	const map = new Map<string, string>();
	for (const m of planMemberInfo(ctx, model, list)) {
		if (m.shortName) {
			map.set(m.displayName.trim().toLowerCase(), m.shortName);
		}
	}
	return map;
}

/** Resolve the plan's wikilink members to contact files */
export function resolvePlanMembers(
	ctx: PageContext,
	model: ContactPageModel
): TFile[] {
	if (!model.file) return [];
	const members = asArray(model.data.members).map(String);
	const files: TFile[] = [];
	for (const raw of members) {
		const linktext = String(raw).replace(/^\[\[|\]\]$/g, "");
		const dest = ctx.app.metadataCache.getFirstLinkpathDest(
			linktext,
			model.file.path
		);
		if (dest) files.push(dest);
	}
	return files;
}

/** Everyone at the table: guests/contacts + you. */
export function planMemberCount(
	ctx: PageContext,
	model: ContactPageModel
): number {
	const yourName = ctx.plugin.settings.yourName;
	const members = asArray(model.data.members).map(String);
	const others = members.filter(
		(raw) =>
			!yourName ||
			String(raw)
				.replace(/^\[\[|\]\]$/g, "")
				.toLowerCase() !== yourName.toLowerCase()
	).length;
	return others + (yourName ? 1 : 0);
}

/**
 * A member list resolved for display.
 *
 * Your own entry is dropped from `members`: you're rendered separately and
 * unremovably, and a plan that also lists you as a guest would show you
 * twice. The stored index rides along, since removal addresses the list
 * rather than the name.
 */
export function planMemberChips(
	ctx: PageContext,
	model: ContactPageModel,
	key: "members" | "unconfirmedMembers"
): PlanMemberChip[] {
	const file = model.file;
	if (!file) return [];
	const yourName = ctx.plugin.settings.yourName;
	return asArray(model.data[key])
		.map((raw, index) => ({ raw: toText(raw), index }))
		.filter(
			({ raw }) =>
				key !== "members" ||
				!yourName ||
				raw.replace(/^\[\[|\]\]$/g, "").toLowerCase() !==
					yourName.toLowerCase()
		)
		.map(({ raw, index }) => {
			const linktext = raw.replace(/^\[\[|\]\]$/g, "");
			const dest = ctx.app.metadataCache.getFirstLinkpathDest(
				linktext,
				file.path
			);
			return {
				// `||`, not `??`: a cleared `displayName: ""` is exactly
				// as unset as a missing one, and should fall back to the
				// file's own name the same way, rather than rendering
				// the chip blank.
				display: dest
					? String(
							ctx.app.metadataCache.getFileCache(dest)
								?.frontmatter?.displayName || dest.basename
					  )
					: linktext,
				path: dest ? dest.path : null,
				index,
			};
		});
}

export async function removePlanEntry(
	ctx: PageContext,
	model: ContactPageModel,
	key: "members" | "unconfirmedMembers",
	index: number
) {
	model.removeAt(key, index);
	await saveModel(ctx, model);
	ctx.render();
}

export async function confirmPlanMember(
	ctx: PageContext,
	model: ContactPageModel,
	index: number
) {
	// toText, not String(): a hand-edited list can hold a map, which
	// String() would turn into "[object Object]" and then store as a
	// member. An unusable entry confirms to nothing instead.
	const raw = toText(asArray(model.data.unconfirmedMembers)[index]);
	if (!raw) return;
	model.removeAt("unconfirmedMembers", index);
	model.push("members", raw);
	await saveModel(ctx, model);
	ctx.render();
}

export async function openAddPlanMember(
	ctx: PageContext,
	model: ContactPageModel
) {
	const ops = ctx.plugin.contactOperations;
	const contacts = await ops.getContacts();
	const existing = new Set(resolvePlanMembers(ctx, model).map((f) => f.path));
	const groups = ops.getGroupInfos(contacts).map((g) => ({
		name: g.name,
		label: ops.labelOf(g),
		color: g.color,
	}));
	new AddPlanMemberModal(
		ctx.app,
		contacts.filter((c) => !existing.has(c.file.path)),
		groups,
		async ({ contact, name }, isUnconfirmed) => {
			const entry = contact ? `[[${contact.file.basename}]]` : name;
			model.push(
				isUnconfirmed ? "unconfirmedMembers" : "members",
				entry
			);
			await saveModel(ctx, model);
			ctx.render();
		}
	).open();
}

/** A people string as first names, using the plan's own roster. */
export function shortenPlanPeople(
	ctx: PageContext,
	model: ContactPageModel,
	people: string
): string {
	return shortenPeopleList(
		people,
		planParticipants(ctx, model),
		ctx.plugin.settings.yourName,
		planShortNameOverrides(ctx, model)
	);
}

export function planParticipants(
	ctx: PageContext,
	model: ContactPageModel
): string[] {
	const names = planMemberDisplays(ctx, model);
	const yourName = ctx.plugin.settings.yourName;
	if (
		yourName &&
		!names.some((n) => n.toLowerCase() === yourName.toLowerCase())
	) {
		return [yourName, ...names];
	}
	return names;
}
