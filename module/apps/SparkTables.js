import { hexLabel } from "../actions/hex-names.js";
import { companyTokenHex } from "../actions/company.js";
import { keepHexSparks, keepTableRoll, throwSparkDice, wildernessHexTables } from "../actions/hex-lore.js";
import { keepHexPerson, namesForHex, postPerson, rollPersonTables } from "../actions/people.js";
import { isRealmScene } from "../actions/realm.js";
import { rollSpark } from "../actions/referee-rolls.js";
import { loadArtIndex } from "../book-art/art-index.js";
import { postCard, t } from "../chat/cards.js";
import { read, reducesMotion } from "../client-settings.js";
import { noPicks, pickRow, pickTablesView } from "../rules/gm-toolkit.js";
import { sparkKeepTarget } from "../rules/hex-lore.js";
import { PEOPLE_PAGE } from "../rules/people.js";
import { SPARK_PAGES } from "../rules/spark-tables.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { placesChosenHex } from "./places-hex.js";
import { spinTable } from "./roll-spin.js";
import { toggleShown } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Whether a roll runs its highlight down the columns, as each browser left the tick box. */
const ANIMATE_SETTING = "sparkAnimate";

/** Register the Animate selection tick box's setting. Called during init. */
export function registerSparkTablesSetting() {
	game.settings.register(SYSTEM_ID, ANIMATE_SETTING, {
		scope: "client",
		config: false,
		type: Boolean,
		default: true
	});
}

/** @returns {boolean} Whether a roll on any Spark Table window runs its highlight. */
export const animates = () => read(ANIMATE_SETTING, true) !== false;

/**
 * Wire an Animate selection tick box to the setting, so each window that shows
 * one leaves it the same for the others.
 * @param {HTMLElement} root
 */
export function wireAnimateBox(root) {
	root.querySelector("[name=animate]")?.addEventListener("change", (event) => {
		game.settings.set(SYSTEM_ID, ANIMATE_SETTING, event.currentTarget.checked);
	});
}

/**
 * Roll tables drawn by spark-pick-tables.hbs, where only the GMs see the dice:
 * every table, one table's columns, or one column. Every highlight runs at
 * once, and each column's row is taken once it lands.
 * @param {{columns: string[]}[]} tables
 * @param {(number|null)[][]} taken The row taken in each column of each table, from 1, or null; changed in place.
 * @param {{table?: string, column?: string}} which From the clicked button's dataset: neither for every table.
 * @param {() => HTMLElement|null} shown The window's element, or null once it no longer shows these tables.
 * @param {() => void} [landed] Called once the rows are taken, before the highlights stop spinning.
 * @returns {Promise<boolean>} False, with nothing taken, when the tables went from view while the dice rolled.
 */
export async function rollPicks(tables, taken, { table, column }, shown, landed = () => {}) {
	const plan = (table === undefined ? tables.map((_, index) => index) : [Number(table)]).map((index) => ({
		index,
		columns: column === undefined ? tables[index].columns.map((_, at) => at) : [Number(column)]
	}));
	const dice = await throwSparkDice(plan.reduce((count, { columns }) => count + columns.length, 0));
	const root = shown();
	if (!root) return false;
	let next = 0;
	const reduce = !animates() || reducesMotion();
	const spins = plan.map(({ index, columns }) => {
		const rolls = columns.map(() => dice[next++]);
		columns.forEach((at, rolled) => (taken[index][at] = rolls[rolled]));
		return spinTable(root.querySelector(`table[data-pick-table="${index}"]`), columns, rolls.map((roll) => ({ roll })), { reduce });
	});
	landed();
	await Promise.all(spins);
	return true;
}

/**
 * The page a wilderness hex is rolled on (p22): the Nature page's tables for
 * one, chosen by dice or by hand and kept in the hex together. It comes before
 * the book's own pages.
 */
export const WILD_PAGE = "wild";

/** @type {SparkTables|null} The window, once opened. */
let window_ = null;

/**
 * Where a roll here is kept: the hex a GM has chosen in Places, or else
 * the one the Company stands in on the Realm being viewed.
 * @returns {{scene: Scene, hex: {col: number, row: number}}|null}
 */
function keepTarget() {
	const viewed = canvas?.scene ?? null;
	const companyHex = isRealmScene(viewed) ? companyTokenHex(viewed) : null;
	return sparkKeepTarget({ lore: placesChosenHex(), company: companyHex ? { scene: viewed, hex: companyHex } : null });
}

/** The words for where rolls are kept: the Keep rolls box's, or the Wilderness Hex page's Save button's. */
const KEEP_IN = "spark.keepIn";
const WILD_KEEP_IN = "hexLore.wildHex.keepIn";

/**
 * @param {string} [key] KEEP_IN or WILD_KEEP_IN.
 * @param {{scene: Scene, hex: {col: number, row: number}}|null} [target] Where it keeps, if not where rolls are kept now.
 * @returns {{label: string, disabled: boolean}} What the Keep rolls box, or the Save button, says now.
 */
function keepWords(key = KEEP_IN, target = keepTarget()) {
	return target
		? { label: t(key, { hex: hexLabel(target.hex, target.scene) }), disabled: false }
		: { label: t("spark.keepNone"), disabled: true };
}

/**
 * Say again where rolls are kept, as Places opens on a hex, moves
 * or closes. The box and the Save button alone are touched: a redraw would cut
 * a running highlight short and wipe the entries it marked.
 */
export function refreshSparkKeep() {
	if (!window_?.rendered) return;
	const box = window_.element.querySelector("[name=keep]");
	if (box) {
		const { label, disabled } = keepWords();
		box.disabled = disabled;
		const words = box.closest("label")?.querySelector(".bastionland-check__label");
		if (words) words.textContent = label;
	}
	const save = window_.element.querySelector("[data-keep-wild]");
	if (save) {
		const { label, disabled } = keepWords(WILD_KEEP_IN, window_.wildTarget);
		save.disabled = disabled || save.hasAttribute("data-nothing-taken");
		const words = save.querySelector("[data-keep-label]");
		if (words) words.textContent = label;
	}
}

/**
 * The Spark Tables read from the GM's own rulebook, one page at a time the way
 * the book lays them out. Rolling a table rolls a d12 for each column and posts
 * the prompt, while a highlight runs down each column to the entry it landed on.
 */
export class SparkTables extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-spark-window"],
		position: { width: 780, height: 760 },
		window: { title: "bastionland.spark.title", icon: "fa-solid fa-wand-sparkles", resizable: true },
		actions: {
			showPage: SparkTables.#onShowPage,
			roll: SparkTables.#onRoll,
			rollPerson: SparkTables.#onRollPerson,
			rollPick: SparkTables.#onRollPick,
			pickRow: SparkTables.#onPickRow,
			keepWild: SparkTables.#onKeepWild
		}
	};

	static PARTS = {
		tables: {
			template: templatePath("apps/spark-tables.hbs"),
			scrollable: [".bastionland-spark__grid"]
		}
	};

	/** @type {object|null|undefined} The art index: undefined until loaded, null if never imported. */
	index;

	/** The page on show, one of SPARK_PAGES. */
	#page = SPARK_PAGES[0].key;

	/** @type {{page: string, tables: Record<number, number[]>}|null} The last roll made here: the rolls on each table it took in. */
	#last = null;

	/** A roll's highlight is still running. */
	#spinning = false;

	/** Whether rolls made here are kept in a hex. Ticked each time the window opens. */
	#keep = true;

	/** @type {{page: object, set: {index: number, table: object}[]}|null|undefined} The wilderness tables: undefined until read, null if the Nature page hasn't been. */
	#wild;

	/** @type {(number|null)[][]|null} The row taken in each column of each wilderness table, from 1, or null. */
	#taken = null;

	/** @type {{scene: Scene, hex: {col: number, row: number}}|null} The hex the wilderness rows were taken for, from the first one taken. */
	#takenFor = null;

	/**
	 * Where the Wilderness Hex page's Save keeps what's taken: the hex it was
	 * taken for, so a Places turned to another hex since doesn't
	 * take it, or else where rolls are kept now.
	 * @returns {{scene: Scene, hex: {col: number, row: number}}|null}
	 */
	get wildTarget() {
		if (this.#takenFor && game.scenes.get(this.#takenFor.scene.id)) return this.#takenFor;
		return keepTarget();
	}

	/** Note the hex rows are taken for, as the first is; forget it once none are left. */
	#noteTakenFor() {
		const anyTaken = this.#taken?.some((rows) => rows.some((row) => row !== null));
		if (!anyTaken) this.#takenFor = null;
		else this.#takenFor ??= keepTarget();
	}

	/** @returns {{scene: Scene, hex: {col: number, row: number}}|null} Where a roll made now is kept, if anywhere. */
	#keeping() {
		return this.#keep ? keepTarget() : null;
	}

	/** @returns {object|null} The page on show, as the art index holds it. */
	#shown() {
		return this.index?.spark?.find((page) => page.key === this.#page) ?? null;
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		if (this.index === undefined) this.index = await loadArtIndex();
		const imported = this.index?.spark ?? [];
		const wildShown = this.#page === WILD_PAGE;
		const shown = wildShown ? null : this.#shown();
		const last = this.#last?.page === this.#page ? this.#last : null;

		let notice = null;
		if (!this.index) notice = t("spark.noIndex");
		else if (!imported.length) notice = t("spark.noText");

		return Object.assign(context, {
			notice,
			animate: animates(),
			keep: { checked: this.#keep, ...keepWords() },
			pages: [WILD_PAGE, ...SPARK_PAGES.map(({ key }) => key)].map((key) => ({
				key,
				label: imported.find((page) => page.key === key)?.name ?? t(`spark.pages.${key}`),
				active: key === this.#page
			})),
			wild: wildShown && this.index ? await this.#wildContext() : null,
			reference: shown ? t("spark.reference", { page: shown.page }) : null,
			tables: (shown?.tables ?? []).map((table, index) => ({
				index,
				name: table.name,
				rollLabel: t("spark.rollTable", { name: table.name }),
				columns: table.columns,
				rows: table.rows.map((entries, row) => ({
					number: row + 1,
					entries: entries.map((entry, column) => ({
						entry,
						rolled: last?.tables[index]?.[column] === row + 1
					}))
				}))
			})),
			empty: Boolean(this.index?.spark) && !wildShown && !shown
		});
	}

	/** @returns {Promise<object>} The Wilderness Hex page: the Nature page's tables for a hex, and what's taken from them. */
	async #wildContext() {
		if (this.#wild === undefined) this.#wild = await wildernessHexTables();
		if (!this.#wild) return { missing: true };
		const { page, set } = this.#wild;
		const tables = set.map(({ table }) => table);
		this.#taken ??= noPicks(tables);
		const view = pickTablesView(tables, this.#taken, {
			table: (name) => t("hexLore.wildHex.rollTable", { name }),
			column: (column) => t("hexLore.wildHex.rollColumn", { column })
		});
		const save = keepWords(WILD_KEEP_IN, this.wildTarget);
		return {
			reference: t("hexLore.wildHex.reference", { page: page.page }),
			...view,
			save: { label: save.label, disabled: save.disabled || view.nothingTaken }
		};
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		wireAnimateBox(this.element);
		this.element.querySelector("[name=keep]")?.addEventListener("change", (event) => {
			this.#keep = event.currentTarget.checked;
		});
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		this.#keep = true;
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {SparkTables} */
	static #onShowPage(_event, target) {
		if (this.#spinning) return;
		const { page } = target.dataset;
		if (page === this.#page) return;
		return this.turnTo(page);
	}

	/**
	 * Show one of the pages: the Wilderness Hex page or one of the book's.
	 * @param {string} page
	 * @returns {Promise<SparkTables>|undefined} Undefined when there's no such page, or a roll is still running.
	 */
	turnTo(page) {
		if (this.#spinning || (page !== WILD_PAGE && !SPARK_PAGES.some(({ key }) => key === page))) return;
		this.#page = page;
		return this.render({ force: true });
	}

	/**
	 * Roll a table. The card goes out as the highlight starts down its columns,
	 * and the entries stay marked once it lands.
	 * @this {SparkTables}
	 */
	static async #onRoll(_event, target) {
		if (this.#spinning) return;
		const shown = this.#shown();
		const index = Number(target.dataset.table);
		const table = shown?.tables[index];
		if (!table) return;

		this.#spinning = true;
		try {
			const { roll, results, prompt } = await rollSpark(table);
			this.#last = { page: this.#page, tables: { [index]: results.map((result) => result.roll) } };
			this.#clearMarks();

			const card = postCard(null, "spark", {
				name: table.name,
				tagline: t("spark.tagline", { page: shown.name, number: shown.page }),
				prompt,
				results
			}, { rolls: [roll] });
			const spin = spinTable(this.element.querySelector(`table[data-table="${index}"]`), table.columns.map((_, column) => column), results, {
				reduce: !animates() || reducesMotion()
			});
			const target = this.#keeping();
			const kept = target ? keepTableRoll({ ...target, page: shown, table, results }) : null;
			await Promise.all([card, spin, kept]);
		} finally {
			this.#spinning = false;
			refreshSparkKeep();
		}
		// No redraw: the entries it landed on are marked already, and a redraw would cut their flash short.
	}

	/**
	 * Roll every wilderness table, one table's columns, or the column whose
	 * heading was clicked (rollPicks). Nothing is kept yet.
	 * @this {SparkTables}
	 */
	static async #onRollPick(_event, target) {
		if (this.#spinning || !this.#wild || !this.#taken) return;
		const { table, column } = target.dataset;
		this.#spinning = true;
		try {
			// Closed, or turned from, while the dice were still rolling: nothing's left to spin.
			const shown = () => (this.rendered && this.#page === WILD_PAGE ? this.element : null);
			// Noted as the dice land, so a hex chosen in Places while the highlights spin isn't where these rows go.
			const landed = () => {
				// Every row rolled afresh is taken for the hex rolls are kept in now.
				if (table === undefined && column === undefined) this.#takenFor = null;
				this.#noteTakenFor();
			};
			if (!(await rollPicks(this.#wild.set.map((each) => each.table), this.#taken, target.dataset, shown, landed))) return;
		} finally {
			this.#spinning = false;
		}
		return this.render();
	}

	/**
	 * Take a wilderness entry by hand, or let it go if it's already the one taken.
	 * @this {SparkTables}
	 */
	static #onPickRow(_event, target) {
		if (this.#spinning || !pickRow(this.#taken, target.dataset)) return;
		this.#noteTakenFor();
		return this.render();
	}

	/**
	 * Keep what's taken from the wilderness tables in the hex rolls are kept in,
	 * whisper the GMs its card, and clear the page for the next hex.
	 * @this {SparkTables}
	 */
	static async #onKeepWild() {
		const target = this.wildTarget;
		if (this.#spinning || !this.#wild || !this.#taken || !target) return;
		const taken = this.#wild.set.map(({ table }, index) => ({ table, rows: this.#taken[index] }));
		const kept = await keepHexSparks({ ...target, page: this.#wild.page, taken });
		if (!kept.length) return;
		this.#taken = null;
		this.#takenFor = null;
		return this.render();
	}

	/** The last roll's marks go as the next one starts. */
	#clearMarks() {
		for (const cell of this.element.querySelectorAll(".bastionland-spark__table td.is-rolled")) cell.classList.remove("is-rolled");
	}

	/**
	 * Roll a person on every People table at once (p200, p202). The window turns
	 * to the People page so the highlight can run down each table, and one card
	 * goes out for the lot.
	 * @this {SparkTables}
	 */
	static async #onRollPerson() {
		if (this.#spinning) return;
		this.#spinning = true;
		try {
			const person = await rollPersonTables();
			if (!person) return;
			this.#last = { page: PEOPLE_PAGE, tables: Object.fromEntries(person.rolled.map(({ results }, index) => [index, results.map((result) => result.roll)])) };
			if (this.#page === PEOPLE_PAGE) this.#clearMarks();
			else {
				// Drawn with the roll already marked, which the highlight then runs down to.
				this.#page = PEOPLE_PAGE;
				await this.render();
			}
			const reduce = !animates() || reducesMotion();
			const spins = person.rolled.map(({ table, results }, index) => spinTable(
				this.element.querySelector(`table[data-table="${index}"]`),
				table.columns.map((_, column) => column),
				results,
				{ reduce }
			));
			const target = this.#keeping();
			const [name] = namesForHex(target?.scene ?? null, target?.hex ?? null, 1);
			const kept = target ? keepHexPerson(target.scene, target.hex, person, name) : null;
			await Promise.all([postPerson(person, { name }), kept, ...spins]);
		} finally {
			this.#spinning = false;
			// The Company may have moved on since the box last said where rolls go.
			refreshSparkKeep();
		}
	}
}

/**
 * Open the Spark Tables, bringing the window forward if it's already open.
 * @param {object} [options]
 * @param {string} [options.page] The page to turn to, such as WILD_PAGE for a wilderness hex.
 * @returns {SparkTables}
 */
export function openSparkTables({ page } = {}) {
	window_ ??= new SparkTables();
	if (!page || !window_.turnTo(page)) window_.render({ force: true });
	return window_;
}

/**
 * The Spark Tables hotkey: open them, or close them when they're already in front.
 * @returns {true} The key is taken, so the hotbar's own 6 doesn't run as well.
 */
export function toggleSparkTables() {
	if (!toggleShown(window_)) openSparkTables();
	return true;
}
