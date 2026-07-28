import { TFile, TFolder, normalizePath } from "obsidian";
import type FriendTracker from "@/main";
import type { PlanIdeaCategory, PlanPriority } from "@/constants";
import {
	PLAN_IDEA_CATEGORIES,
	TRAVEL_TYPE_EMOJI,
	timeSortValue,
} from "@/constants";
import type {
	PlanCost,
	PlanCredit,
	PlanInfo,
	PlanItem,
	PlanSimpleItem,
	PlanTimelineEntry,
} from "@/types";

export class PlanOperations {
	constructor(private plugin: FriendTracker) {}

	private get app() {
		return this.plugin.app;
	}

	getPlansFolderPath(): string {
		return normalizePath(`${this.plugin.settings.contactsFolder}/Plans`);
	}

	isPlanFile(path: string): boolean {
		return (
			path.startsWith(this.getPlansFolderPath() + "/") &&
			path.endsWith(".md")
		);
	}

	/** Plan ideas — category + priority. Legacy bucket shapes are mapped. */
	static itemsOf(metadata: any): PlanItem[] {
		if (!Array.isArray(metadata?.items)) return [];
		return metadata.items
			.map((i: any) => {
				const legacyBucket = i?.bucket;
				// "food" split into restaurant + cooking; old items → restaurant
				const rawCat = i?.category === "food" ? "restaurant" : i?.category;
				const category: PlanIdeaCategory = rawCat ?? "activity";
				const priority: PlanPriority =
					i?.priority ??
					(legacyBucket === "must" ? "must" : "maybe");
				return {
					text: i?.text ?? String(i),
					category,
					priority,
					...(i?.date && { date: i.date }),
					...(i?.time && { time: i.time }),
					...(i?.people && { people: i.people }),
					...(typeof i?.cost === "number" && { cost: i.cost }),
				};
			})
			.filter((i: PlanItem) => i.text.length > 0);
	}

	/** Flat list readers (travel, accommodation) */
	static simpleListOf(metadata: any, key: string): PlanSimpleItem[] {
		if (!Array.isArray(metadata?.[key])) return [];
		return metadata[key]
			.map((i: any) => {
				if (typeof i === "string") return { text: i };
				// Legacy free-text `day` is dropped; an ISO one is kept as date.
				const date =
					i?.date ??
					(/^\d{4}-\d{2}-\d{2}$/.test(String(i?.day ?? ""))
						? i.day
						: undefined);
				return {
					text: i?.text ?? "",
					...(i?.type && { type: i.type }),
					...(date && { date }),
					...(i?.time && { time: i.time }),
					...(i?.people && { people: i.people }),
					...(i?.duration && { duration: i.duration }),
					...(typeof i?.cost === "number" && { cost: i.cost }),
				};
			})
			.filter((i: PlanSimpleItem) => i.text.length > 0);
	}

	/**
	 * Derived, read-only itinerary: every dated item across ideas, travel and
	 * accommodation, sorted chronologically. Pure — computed on demand, never
	 * stored. `index` is the position in each item's own source list, so the
	 * caller can route an edit/delete straight back to the one real object.
	 */
	static timelineOf(metadata: any): PlanTimelineEntry[] {
		const entries: PlanTimelineEntry[] = [];

		PlanOperations.itemsOf(metadata).forEach((item, index) => {
			if (!item.date) return;
			const cat = PLAN_IDEA_CATEGORIES.find(
				(c) => c.id === item.category
			);
			entries.push({
				source: "idea",
				index,
				date: item.date,
				...(item.time && { time: item.time }),
				...(item.people && { people: item.people }),
				text: item.text,
				emoji: cat?.emoji ?? "💡",
				...(item.cost !== undefined && { cost: item.cost }),
			});
		});

		const stayEmoji = "🛏️";
		(["travel", "accommodation"] as const).forEach((key) => {
			PlanOperations.simpleListOf(metadata, key).forEach(
				(item, index) => {
					if (!item.date) return;
					const emoji =
						key === "travel"
							? item.type
								? TRAVEL_TYPE_EMOJI[item.type]
								: "🧭"
							: stayEmoji;
					entries.push({
						source: key === "travel" ? "travel" : "accommodation",
						index,
						date: item.date,
						...(item.time && { time: item.time }),
						...(item.people && { people: item.people }),
						text: item.text,
						emoji,
						...(item.duration && { duration: item.duration }),
						...(item.cost !== undefined && { cost: item.cost }),
					});
				}
			);
		});

		const key = (e: PlanTimelineEntry) =>
			`${e.date}T${timeSortValue(e.time)}`;
		return entries.sort((a, b) => key(a).localeCompare(key(b)));
	}

	static costsOf(metadata: any): PlanCost[] {
		if (!Array.isArray(metadata?.costs)) return [];
		return metadata.costs
			.map((c: any) => ({
				label: c?.label ?? "",
				amount: Number(c?.amount) || 0,
				split: {
					mode: ["shares", "percent"].includes(c?.split?.mode)
						? c.split.mode
						: "even",
					...(c?.split?.shares && {
						shares: c.split.shares,
					}),
				},
			}))
			.filter((c: PlanCost) => c.label.length > 0);
	}

	/** Credits (money already handed over), deducted from what a person owes. */
	static creditsOf(metadata: any): PlanCredit[] {
		if (!Array.isArray(metadata?.credits)) return [];
		return metadata.credits
			.map((c: any) => ({
				person: String(c?.person ?? ""),
				amount: Number(c?.amount) || 0,
				...(c?.note && { note: String(c.note) }),
			}))
			.filter((c: PlanCredit) => c.person.length > 0 && c.amount > 0);
	}

	/** Total a person has already been credited. */
	static creditTotalFor(person: string, credits: PlanCredit[]): number {
		return credits
			.filter((c) => c.person === person)
			.reduce((s, c) => s + c.amount, 0);
	}

	static membersOf(metadata: any): string[] {
		const raw = metadata?.members;
		return Array.isArray(raw) ? raw.map(String) : [];
	}

	/** All plans, straight from the metadata cache — zero file I/O */
	getPlans(): PlanInfo[] {
		const folder = this.app.vault.getAbstractFileByPath(
			this.getPlansFolderPath()
		);
		if (!(folder instanceof TFolder)) return [];
		return folder.children
			.filter(
				(f): f is TFile => f instanceof TFile && f.extension === "md"
			)
			.map((file) => {
				const fm =
					this.app.metadataCache.getFileCache(file)?.frontmatter;
				return {
					file,
					name: fm?.name ? String(fm.name) : file.basename,
					date: fm?.date ? String(fm.date) : "",
					endDate: fm?.endDate ? String(fm.endDate) : "",
					location: fm?.location ? String(fm.location) : "",
					status: fm?.status ? String(fm.status) : "planning",
					items: PlanOperations.itemsOf(fm),
					members: PlanOperations.membersOf(fm),
				};
			});
	}

	async createPlan(
		name: string,
		date: string,
		location = "",
		endDate = ""
	): Promise<TFile> {
		const folderPath = this.getPlansFolderPath();
		if (!this.app.vault.getAbstractFileByPath(folderPath)) {
			await this.app.vault.createFolder(folderPath);
		}
		const safeName = name.replace(/[\\/:*?"<>|#^[\]]/g, "-").trim();
		let path = normalizePath(`${folderPath}/${safeName}.md`);
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(path)) {
			path = normalizePath(`${folderPath}/${safeName} ${counter++}.md`);
		}
		const loc = location.trim()
			? `location: ${JSON.stringify(location.trim())}\n`
			: "";
		const end = endDate.trim() ? `endDate: ${endDate.trim()}\n` : "";
		return await this.app.vault.create(
			path,
			`---\nname: ${JSON.stringify(name)}\ndate: ${date}\n${end}${loc}status: planning\n---\n`
		);
	}

	/** Quick-capture path: append an idea without opening the plan */
	async addItem(file: TFile, item: PlanItem): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm.items = [...PlanOperations.itemsOf(fm), item];
		});
	}

	/** Bring items are a checklist; legacy plain strings read as unchecked */
	static bringOf(metadata: any): Array<{ text: string; done: boolean }> {
		if (!Array.isArray(metadata?.bring)) return [];
		return metadata.bring
			.map((b: any) =>
				typeof b === "string"
					? { text: b, done: false }
					: { text: b?.text ?? "", done: !!b?.done }
			)
			.filter((b: { text: string }) => b.text.length > 0);
	}

	/** Quick-capture path for the bring list */
	async addBringItem(file: TFile, text: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm.bring = [
				...PlanOperations.bringOf(fm),
				{ text, done: false },
			];
		});
	}

	/** Sum of per-item costs across ideas, travel and accommodation */
	static estimate(metadata: any): number {
		const items = PlanOperations.itemsOf(metadata);
		const travel = PlanOperations.simpleListOf(metadata, "travel");
		const stay = PlanOperations.simpleListOf(metadata, "accommodation");
		return [...items, ...travel, ...stay].reduce(
			(sum, i) => sum + (i.cost ?? 0),
			0
		);
	}

	/**
	 * Resolve who owes what for one cost item. Participants come from the
	 * plan (members + your name); shares default to 1 (even) when unset.
	 */
	static owedFor(
		cost: PlanCost,
		participants: string[]
	): Record<string, number> {
		const result: Record<string, number> = {};
		if (participants.length === 0) return result;
		const shares = cost.split.shares ?? {};
		if (cost.split.mode === "shares") {
			const total = participants.reduce(
				(sum, p) => sum + (shares[p] ?? 0),
				0
			);
			if (total <= 0) return result;
			for (const p of participants) {
				result[p] = (cost.amount * (shares[p] ?? 0)) / total;
			}
		} else if (cost.split.mode === "percent") {
			// Literal percentages — under/over 100% is intentional and
			// visible; the modal's live total keeps it honest
			for (const p of participants) {
				result[p] = (cost.amount * (shares[p] ?? 0)) / 100;
			}
		} else {
			// Even split — among the included set if given, else everyone
			const included =
				Object.keys(shares).length > 0
					? participants.filter((p) => shares[p])
					: participants;
			if (included.length === 0) return result;
			const each = cost.amount / included.length;
			for (const p of included) result[p] = each;
		}
		return result;
	}

	/**
	 * How one person's total splits across each expense they're part of:
	 * label, a human "how" descriptor (e.g. "2 shares", "25%", "even"), and
	 * the amount they owe for that item.
	 */
	static breakdownFor(
		person: string,
		costs: PlanCost[],
		participants: string[],
		credits: PlanCredit[] = []
	): Array<{ label: string; descriptor: string; amount: number }> {
		const rows: Array<{
			label: string;
			descriptor: string;
			amount: number;
		}> = [];
		for (const cost of costs) {
			const amount = PlanOperations.owedFor(cost, participants)[person];
			if (!amount || amount <= 0) continue;
			const shares = cost.split.shares ?? {};
			let descriptor: string;
			if (cost.split.mode === "shares") {
				const w = shares[person] ?? 1;
				descriptor = `${w} ${w === 1 ? "share" : "shares"}`;
			} else if (cost.split.mode === "percent") {
				descriptor = `${shares[person] ?? 0}%`;
			} else {
				descriptor = "even";
			}
			rows.push({ label: cost.label, descriptor, amount });
		}
		// Credits come off as negative lines
		for (const c of credits.filter((c) => c.person === person)) {
			rows.push({
				label: "Credit",
				descriptor: c.note || "already paid",
				amount: -c.amount,
			});
		}
		return rows;
	}
}
