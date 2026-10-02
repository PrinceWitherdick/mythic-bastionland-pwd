import { deleteLedgerEntries, ledgerEntries } from "../actions/ledger.js";
import { t } from "../chat/cards.js";
import { ledgerDay, ledgerGroups } from "../rules/ledger.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { confirmDialog } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * One window per Ledger. By UUID, as an unlinked Token's Knight shares its id with the world's.
 * @param {Actor} actor
 */
const windowId = (actor) => `bastionland-ledger-${actor.uuid.replaceAll(".", "-")}`;

/** The filter's values say whether they pick a whole group or one subject in it. */
const GROUP_PREFIX = "group:";
const SUBJECT_PREFIX = "subject:";

/**
 * A Knight's Ledger, after Stonetop's: every change made to them, grouped by
 * day, with a search, a filter by what changed, and newest or oldest first.
 * Their owners may strike lines out.
 */
export class LedgerWindow extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-dialog", "bastionland-ledger-window"],
		position: { width: 560, height: 640 },
		window: { icon: "fa-solid fa-scroll", resizable: true },
		actions: {
			toggleEditing: LedgerWindow.#onToggleEditing,
			deleteSelected: LedgerWindow.#onDeleteSelected
		}
	};

	static PARTS = {
		ledger: { template: templatePath("apps/ledger.hbs"), scrollable: [".bastionland-ledger__list"] }
	};

	/** @param {Actor} actor */
	constructor(actor, options = {}) {
		super({ ...options, id: windowId(actor) });
		/** Whose Ledger this is; the Ledger hooks look for it to redraw the window. */
		this.ledgerOf = actor;
	}

	/** What the reader has asked to see, kept across redraws. */
	#view = { search: "", filter: "", oldestFirst: false, editing: false };

	/** @override */
	get title() {
		return t("ledger.title", { name: this.ledgerOf.name });
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const entries = ledgerEntries(this.ledgerOf);
		const ordered = this.#view.oldestFirst ? [...entries].reverse() : entries;
		const days = [];
		for (const entry of ordered) {
			const key = ledgerDay(entry.timestamp);
			if (days.at(-1)?.key !== key) days.push({ key, label: dayLabel(entry.timestamp), entries: [] });
			days.at(-1).entries.push({
				id: entry.id,
				action: entry.action,
				cause: entry.cause ? t("ledger.via", { cause: entry.cause }) : "",
				by: t("ledger.by", { name: entry.userName || game.users.get(entry.userId)?.name || t("ledger.gone") }),
				time: entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "",
				subject: entry.subject ?? "",
				category: entry.category ?? "other"
			});
		}
		const groups = ledgerGroups(entries);
		// A filter whose lines were all deleted would hide everything while the menu read "All changes".
		const offered = groups.flatMap((group) => [`${GROUP_PREFIX}${group.id}`, ...group.subjects.map((subject) => `${SUBJECT_PREFIX}${subject}`)]);
		if (!offered.includes(this.#view.filter)) this.#view.filter = "";
		const { filter } = this.#view;
		return Object.assign(context, {
			editable: this.ledgerOf.isOwner,
			editing: this.#view.editing && this.ledgerOf.isOwner,
			search: this.#view.search,
			oldestFirst: this.#view.oldestFirst,
			empty: !entries.length,
			groups: groups.map((group) => ({
				value: `${GROUP_PREFIX}${group.id}`,
				label: t(`ledger.categories.${group.id}`),
				allLabel: t("ledger.allOf", { category: t(`ledger.categories.${group.id}`), count: group.count }),
				selected: filter === `${GROUP_PREFIX}${group.id}`,
				subjects: group.subjects.map((subject) => ({
					value: `${SUBJECT_PREFIX}${subject}`,
					label: subject,
					selected: filter === `${SUBJECT_PREFIX}${subject}`
				}))
			})),
			days
		});
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		const root = this.element;
		root.querySelector("[name=search]")?.addEventListener("input", (event) => {
			this.#view.search = event.target.value;
			this.#applyFilter();
		});
		root.querySelector("[name=filter]")?.addEventListener("change", (event) => {
			this.#view.filter = event.target.value;
			this.#applyFilter();
		});
		root.querySelector("[name=order]")?.addEventListener("change", (event) => {
			this.#view.oldestFirst = event.target.value === "oldest";
			this.render();
		});
		root.querySelector("[name=selectAll]")?.addEventListener("change", (event) => {
			for (const box of this.#visibleChecks()) box.checked = event.target.checked;
			this.#syncSelection();
		});
		root.querySelector(".bastionland-ledger__list")?.addEventListener("change", (event) => {
			if (event.target.matches("[name=pick]")) this.#syncSelection();
		});
		this.#applyFilter();
	}

	/** Show only the lines the search and the filter allow, and the days that still have one. */
	#applyFilter() {
		const root = this.element;
		const term = this.#view.search.trim().toLocaleLowerCase();
		const { filter } = this.#view;
		const group = filter.startsWith(GROUP_PREFIX) ? filter.slice(GROUP_PREFIX.length) : "";
		const subject = filter.startsWith(SUBJECT_PREFIX) ? filter.slice(SUBJECT_PREFIX.length) : "";
		let shown = 0;
		for (const day of root.querySelectorAll(".bastionland-ledger__day")) {
			let dayShown = 0;
			for (const row of day.querySelectorAll(".bastionland-ledger__entry")) {
				const text = row.querySelector(".bastionland-ledger__action")?.textContent ?? "";
				const visible = (!term || text.toLocaleLowerCase().includes(term))
					&& (!group || row.dataset.category === group)
					&& (!subject || row.dataset.subject === subject);
				row.hidden = !visible;
				if (visible) dayShown++;
			}
			day.hidden = !dayShown;
			shown += dayShown;
		}
		const none = root.querySelector(".bastionland-ledger__none");
		if (none) none.hidden = shown > 0 || !root.querySelector(".bastionland-ledger__entry");
		this.#syncSelection();
	}

	/** @returns {HTMLInputElement[]} The tick boxes of the lines on show. */
	#visibleChecks() {
		return [...this.element.querySelectorAll(".bastionland-ledger__entry:not([hidden]) [name=pick]")];
	}

	/** Select All reads whether all, some or none of the lines on show are ticked. */
	#syncSelection() {
		const all = this.element.querySelector("[name=selectAll]");
		if (!all) return;
		const boxes = this.#visibleChecks();
		const ticked = boxes.filter((box) => box.checked).length;
		all.checked = ticked > 0 && ticked === boxes.length;
		all.indeterminate = ticked > 0 && ticked < boxes.length;
	}

	/** @this {LedgerWindow} */
	static #onToggleEditing() {
		this.#view.editing = !this.#view.editing;
		this.render();
	}

	/** @this {LedgerWindow} */
	static async #onDeleteSelected() {
		const ids = new Set(this.#visibleChecks().filter((box) => box.checked).map((box) => box.closest("[data-entry-id]").dataset.entryId));
		if (!ids.size) return;
		if (ids.size > 1) {
			const sure = await confirmDialog({
				title: t("ledger.deleteTitle"),
				message: t("ledger.deleteMany", { count: ids.size })
			});
			if (!sure) return;
		}
		await deleteLedgerEntries(this.ledgerOf, ids);
	}
}

/**
 * @param {number} timestamp
 * @returns {string} Such as "Saturday, 19 September 2026".
 */
function dayLabel(timestamp) {
	const date = timestamp ? new Date(timestamp) : null;
	if (!date || Number.isNaN(date.getTime())) return t("ledger.unknownDay");
	return date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

/**
 * Show a Knight's Ledger, bringing it forward if it's already open.
 * @param {Actor} actor
 * @returns {LedgerWindow}
 */
export function openLedger(actor) {
	const app = foundry.applications.instances.get(windowId(actor)) ?? new LedgerWindow(actor);
	app.render({ force: true });
	return app;
}
