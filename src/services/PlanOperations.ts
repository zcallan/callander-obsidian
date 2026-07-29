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
import { asArray, fieldOf, isRecord } from "@/utils/fm";

/** The named field when it's a non-empty string, else undefined. */
function strFieldOf(value: unknown, key: string): string | undefined {
	const v = fieldOf(value, key);
	return typeof v === "string" && v ? v : undefined;
}

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
	static itemsOf(metadata: unknown): PlanItem[] {
		return asArray(fieldOf(metadata, "items"))
			.map((i): PlanItem => {
				const legacyBucket = fieldOf(i, "bucket");
				// "food" split into restaurant + cooking; old items → restaurant
				const rawCat = fieldOf(i, "category");
				const category =
					rawCat === "food"
						? "restaurant"
						: typeof rawCat === "string" && rawCat
						? (rawCat as PlanIdeaCategory)
						: "activity";
				const rawPriority = fieldOf(i, "priority");
				const priority =
					typeof rawPriority === "string" && rawPriority
						? (rawPriority as PlanPriority)
						: legacyBucket === "must"
						? "must"
						: "maybe";
				const rawText = fieldOf(i, "text");
				const cost = fieldOf(i, "cost");
				return {
					text:
						typeof rawText === "string"
							? rawText
							: rawText == null
							? String(i)
							: "",
					category,
					priority,
					...(strFieldOf(i, "date") && { date: strFieldOf(i, "date") }),
					...(strFieldOf(i, "time") && { time: strFieldOf(i, "time") }),
					...(strFieldOf(i, "people") && {
						people: strFieldOf(i, "people"),
					}),
					...(typeof cost === "number" && { cost }),
				};
			})
			.filter((i) => i.text.length > 0);
	}

	/** Flat list readers (travel, accommodation) */
	static simpleListOf(metadata: unknown, key: string): PlanSimpleItem[] {
		return asArray(fieldOf(metadata, key))
			.map((i): PlanSimpleItem => {
				if (typeof i === "string") return { text: i };
				// Legacy free-text `day` is dropped; an ISO one is kept as date.
				const day = strFieldOf(i, "day");
				const date =
					strFieldOf(i, "date") ??
					(day && /^\d{4}-\d{2}-\d{2}$/.test(day)
						? day
						: undefined);
				const type = strFieldOf(i, "type");
				const rawText = fieldOf(i, "text");
				const cost = fieldOf(i, "cost");
				return {
					text: typeof rawText === "string" ? rawText : "",
					...(type && { type: type as PlanSimpleItem["type"] }),
					...(date && { date }),
					...(strFieldOf(i, "time") && { time: strFieldOf(i, "time") }),
					...(strFieldOf(i, "people") && {
						people: strFieldOf(i, "people"),
					}),
					...(strFieldOf(i, "duration") && {
						duration: strFieldOf(i, "duration"),
					}),
					...(typeof cost === "number" && { cost }),
				};
			})
			.filter((i) => i.text.length > 0);
	}

	/**
	 * Derived, read-only itinerary: every dated item across ideas, travel and
	 * accommodation, sorted chronologically. Pure — computed on demand, never
	 * stored. `index` is the position in each item's own source list, so the
	 * caller can route an edit/delete straight back to the one real object.
	 */
	static timelineOf(metadata: unknown): PlanTimelineEntry[] {
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

	static costsOf(metadata: unknown): PlanCost[] {
		return asArray(fieldOf(metadata, "costs"))
			.map((c): PlanCost => {
				const label = fieldOf(c, "label");
				const split = fieldOf(c, "split");
				const mode = fieldOf(split, "mode");
				const shares = fieldOf(split, "shares");
				return {
					label: typeof label === "string" ? label : "",
					amount: Number(fieldOf(c, "amount")) || 0,
					split: {
						mode:
							mode === "shares" || mode === "percent"
								? mode
								: "even",
						...(isRecord(shares) && {
							shares: shares as Record<string, number>,
						}),
					},
				};
			})
			.filter((c) => c.label.length > 0);
	}

	/** Credits (money already handed over), deducted from what a person owes. */
	static creditsOf(metadata: unknown): PlanCredit[] {
		return asArray(fieldOf(metadata, "credits"))
			.map((c): PlanCredit => {
				const note = fieldOf(c, "note");
				return {
					person: String(fieldOf(c, "person") ?? ""),
					amount: Number(fieldOf(c, "amount")) || 0,
					...(note ? { note: String(note) } : {}),
				};
			})
			.filter((c) => c.person.length > 0 && c.amount > 0);
	}

	/** Total a person has already been credited. */
	static creditTotalFor(person: string, credits: PlanCredit[]): number {
		return credits
			.filter((c) => c.person === person)
			.reduce((s, c) => s + c.amount, 0);
	}

	static membersOf(metadata: unknown): string[] {
		return asArray(fieldOf(metadata, "members")).map(String);
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
				const fm: unknown =
					this.app.metadataCache.getFileCache(file)?.frontmatter;
				const str = (key: string): string => {
					const v = fieldOf(fm, key);
					return v ? String(v) : "";
				};
				return {
					file,
					name: str("name") || file.basename,
					date: str("date"),
					endDate: str("endDate"),
					location: str("location"),
					status: str("status") || "planning",
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
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fm.items = [...PlanOperations.itemsOf(fm), item];
			}
		);
	}

	/** Bring items are a checklist; legacy plain strings read as unchecked */
	static bringOf(metadata: unknown): Array<{ text: string; done: boolean }> {
		return asArray(fieldOf(metadata, "bring"))
			.map((b) => {
				if (typeof b === "string") return { text: b, done: false };
				const text = fieldOf(b, "text");
				return {
					text: typeof text === "string" ? text : "",
					done: !!fieldOf(b, "done"),
				};
			})
			.filter((b) => b.text.length > 0);
	}

	/** Quick-capture path for the bring list */
	async addBringItem(file: TFile, text: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fm.bring = [
					...PlanOperations.bringOf(fm),
					{ text, done: false },
				];
			}
		);
	}

	/** Sum of per-item costs across ideas, travel and accommodation */
	static estimate(metadata: unknown): number {
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
