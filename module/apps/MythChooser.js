/**
 * Settling a Realm's Myths, apart from the roll that made the Realm. Creating
 * a Realm (p14) puts six Myths in remote places and rolls each on the Myths
 * table (p27); which six they are matters more to a Referee than where the
 * rivers ran, so this window lists them and lets them be rolled again, one at
 * a time or all at once, or chosen by hand from the whole table. Only the roll
 * changes: each Myth keeps its number and stays in its hex.
 */
import { hexLabel } from "../actions/hex-names.js";
import { editRealm, getRealm } from "../actions/realm.js";
import { mythEntry } from "../book-art/art-index.js";
import { t } from "../chat/cards.js";
import { createRandom, randomSeed } from "../rules/random.js";
import { placeFeature } from "../rules/realm-edits.js";
import { mythRolls, mythWithRoll, rollFreeMyth, rollMythsAgain } from "../rules/realm-myths.js";
import { searchable } from "../rules/text.js";
import { templatePath } from "../system-id.js";
import { BastionlandChooser } from "./BastionlandChooser.js";
import { fitCards, renderWhenIdle } from "./ui.js";

/** A fresh source of random numbers for one press of a button. */
const freshRandom = () => createRandom(randomSeed());

/**
 * Put a Myth of the book under one of the Realm's numbers, in its hex. Its
 * Omens start unmet: they belong to the Myth, not to the place.
 * @param {object} realm
 * @param {object} g
 * @param {{number: number, hex: object, d6: number, d12: number}} myth
 * @returns {object} The Realm with it.
 */
const placeMyth = (realm, g, { number, hex, d6, d12 }) => placeFeature(realm, g, hex, { kind: "myth", number, d6, d12, omen: 0 });

/**
 * The Referee's window for which Myths a Realm holds: the Realm's own down one
 * side, the book's 72 down the other.
 */
export class MythChooser extends BastionlandChooser {
	static DEFAULT_OPTIONS = {
		id: "bastionland-myth-chooser",
		position: { width: 960, height: 720 },
		window: { icon: "fa-solid fa-dragon" },
		actions: {
			chooseMyth: MythChooser.#onChooseMyth,
			rollMyth: MythChooser.#onRollMyth,
			rollAll: MythChooser.#onRollAll,
			useRoll: MythChooser.#onUseRoll
		}
	};

	static PARTS = {
		chooser: {
			template: templatePath("apps/myth-chooser.hbs"),
			scrollable: [".bastionland-myth-chooser__list", ".bastionland-chooser__grid"]
		}
	};

	/** The Realm's Myths are pictured small beside the table's, so both show larger on hover. */
	static PREVIEWED_ART = `${BastionlandChooser.PREVIEWED_ART}, img.bastionland-myth-chooser__thumb`;

	/** @type {string|null} The Realm Scene whose Myths are being settled. */
	sceneId = null;

	/** @type {number|null} Which of the Realm's Myths a chosen roll would become. */
	number = null;

	/** What the table is searched for. While there's any, the table shows every d6 result's matches. */
	search = "";

	/** @type {ResizeObserver|null} Watches the table for the window being made larger or smaller. */
	#resizing = null;

	/** @returns {Scene|null} */
	get scene() {
		return game.scenes?.get(this.sceneId) ?? null;
	}

	/** @override */
	get title() {
		return t("mythChooser.title");
	}

	/** @returns {object[]} The Myths the Realm holds, in number order. */
	get #myths() {
		const scene = this.scene;
		return scene ? getRealm(scene)?.realm.myths ?? [] : [];
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const myths = this.#myths;
		// A Myth that's gone, or a window opened before any was chosen, settles on the first.
		if (!myths.some((myth) => myth.number === this.number)) this.number = myths[0]?.number ?? null;
		const picked = mythRolls().find((roll) => roll.roll === this.roll) ?? null;
		const held = picked ? mythWithRoll(myths, picked) : null;

		return Object.assign(context, {
			notice: this.index ? null : t("mythChooser.noIndex"),
			myths: myths.map((myth) => this.#line(myth)),
			search: this.search,
			// Every roll is drawn, so a search can find a Myth on any d6 result without drawing the window again.
			cards: mythRolls().map((roll) => {
				const { name, entry } = mythEntry(this.index, roll);
				const inRealm = mythWithRoll(myths, roll);
				return {
					roll: roll.roll,
					d6: roll.d6,
					d12: roll.d12,
					inGroup: roll.d6 === this.group,
					searchText: searchable(`${name} ${roll.d6}-${roll.d12} ${roll.roll}`),
					name,
					img: entry?.path ?? null,
					selected: roll.roll === this.roll,
					taken: Boolean(inRealm),
					takenLabel: inRealm ? t("mythChooser.takenBy", { number: inRealm.number }) : null
				};
			}),
			picked: picked && {
				...this.#line(picked),
				// A Myth already in the Realm can be looked at, but not had twice.
				note: held ? t(held.number === this.number ? "mythChooser.already" : "mythChooser.taken", { number: held.number }) : null,
				free: !held
			},
			useLabel: this.number === null ? null : t("mythChooser.use", { number: this.number }),
			// The button is always drawn, only unseen until there's a Myth to give, so picking one moves nothing.
			offer: Boolean(picked && this.number !== null)
		});
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		const root = this.element;
		root.querySelector("[name=search]")?.addEventListener("input", (event) => {
			this.search = event.target.value;
			this.#applySearch();
		});
		// Choosing a d6 result means looking at all of it, so the search is let go first.
		root.querySelector(".bastionland-chooser__groups")?.addEventListener("click", () => {
			this.search = "";
		});
		this.#applySearch();
		// The table's cards grow and shrink with the window. Each draw brings a new grid to watch.
		this.#resizing?.disconnect();
		const grid = root.querySelector(".bastionland-chooser__grid");
		if (grid) {
			this.#resizing = new ResizeObserver(() => this.#fitTable());
			this.#resizing.observe(grid);
		}
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		this.#resizing?.disconnect();
		this.#resizing = null;
	}

	/**
	 * Draw the Myths on show as large as the table's space allows, all of them
	 * in sight, in as many columns as that takes. Where even the smallest won't
	 * all fit, they're left to the stylesheet's columns and the table scrolls.
	 */
	#fitTable() {
		const grid = this.element?.querySelector(".bastionland-chooser__grid");
		if (!grid) return;
		const cards = [...grid.children].filter((item) => !item.hidden).map((item) => item.firstElementChild);
		const style = getComputedStyle(grid);
		const em = Number.parseFloat(style.fontSize) || 16;
		const measure = () => {
			// What a card holds besides its picture, as drawn now. A name wraps less on a wider card, so it's measured again once they're sized.
			let inset = 0;
			let extra = 0;
			for (const card of cards) {
				const art = card?.querySelector(".bastionland-chooser__thumb");
				if (!art) continue;
				inset = Math.max(inset, card.offsetWidth - art.offsetWidth);
				extra = Math.max(extra, card.offsetHeight - art.offsetHeight);
			}
			return fitCards({
				count: cards.length,
				width: grid.clientWidth,
				height: grid.clientHeight,
				gap: Number.parseFloat(style.rowGap) || 0,
				// The book's Myth pictures are drawn 2:1 at rest; cropped anywhere from 5:2 to 3:2 to take the space.
				widest: 2.5,
				tallest: 1.5,
				inset,
				extra,
				min: 9 * em,
				max: 24 * em
			});
		};
		const apply = (fit) => {
			grid.classList.toggle("is-fitted", Boolean(fit));
			if (!fit) return;
			grid.style.setProperty("--myth-columns", String(fit.columns));
			grid.style.setProperty("--myth-card", `${fit.size}px`);
			grid.style.setProperty("--myth-art", `${fit.art}px`);
		};
		if (!cards.length) return apply(null);
		const first = measure();
		apply(first);
		const second = measure();
		if (second?.columns !== first?.columns || second?.size !== first?.size || second?.art !== first?.art) apply(second);
	}

	/**
	 * Show the Myths the search finds, from every d6 result, or with no search
	 * the d6 result on show. No d6 result is pressed while a search is.
	 */
	#applySearch() {
		const root = this.element;
		const term = searchable(this.search.trim());
		let shown = 0;
		for (const card of root.querySelectorAll(".bastionland-chooser__grid > li")) {
			const visible = term ? card.dataset.search.includes(term) : Number(card.dataset.d6) === this.group;
			card.hidden = !visible;
			if (visible) shown++;
		}
		for (const group of root.querySelectorAll(".bastionland-chooser__group")) {
			const active = !term && Number(group.dataset.d6) === this.group;
			group.classList.toggle("is-active", active);
			group.setAttribute("aria-pressed", String(active));
		}
		root.querySelector(".bastionland-chooser__grid")?.classList.toggle("is-searching", Boolean(term));
		const none = root.querySelector(".bastionland-myth-chooser__none");
		if (none) none.hidden = shown > 0;
		// Fewer Myths found can each be drawn larger.
		this.#fitTable();
	}

	/**
	 * How one Myth reads, whether it's the Realm's or the book's.
	 * @param {{d6: number, d12: number, number?: number, hex?: object}} myth
	 * @returns {object}
	 */
	#line(myth) {
		const { name, page, roll, entry } = mythEntry(this.index, myth);
		return {
			number: myth.number ?? null,
			name,
			img: entry?.path ?? null,
			hex: myth.hex ? hexLabel(myth.hex, this.scene) : null,
			reference: t("mythChooser.reference", { roll, page }),
			selected: myth.number !== undefined && myth.number === this.number
		};
	}

	/**
	 * Change a Realm and draw the window again. The hooks draw it again too, as
	 * they do for every window on a Realm, but this one is waiting on the press.
	 * @param {(realm: object, g: object) => object} edit
	 * @returns {Promise<void>}
	 */
	async #edit(edit) {
		const scene = this.scene;
		if (!scene) return;
		await editRealm(scene, edit);
		if (this.rendered) await this.render();
	}

	/**
	 * Put a Myth of the book under one of the Realm's numbers, in the hex that
	 * Myth's number already lies in. Its Omens start unmet: they belong to the
	 * Myth, not to the place.
	 * @param {number|null} number
	 * @param {{d6: number, d12: number}|null} roll
	 * @returns {Promise<void>}
	 */
	async #setMyth(number, roll) {
		const myth = this.#myths.find((candidate) => candidate.number === number);
		if (!myth || !roll) return;
		await this.#edit((realm, g) => placeMyth(realm, g, { ...myth, d6: roll.d6, d12: roll.d12 }));
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {MythChooser} */
	static #onChooseMyth(_event, target) {
		this.number = Number(target.dataset.number);
		return this.render();
	}

	/**
	 * Roll one of the Realm's Myths again, on a Myth the Realm hasn't got.
	 * @this {MythChooser}
	 */
	static #onRollMyth(_event, target) {
		const myths = this.#myths;
		return this.#setMyth(Number(target.dataset.number), rollFreeMyth(freshRandom(), myths));
	}

	/**
	 * Roll all six again at once, no two alike.
	 * @this {MythChooser}
	 */
	static #onRollAll() {
		const rolled = rollMythsAgain(freshRandom(), this.#myths);
		if (!rolled.length) return Promise.resolve();
		return this.#edit((realm, g) => rolled.reduce((next, myth) => placeMyth(next, g, myth), realm));
	}

	/**
	 * Give the Myth chosen from the table to the Myth of the Realm on show.
	 * @this {MythChooser}
	 */
	static #onUseRoll() {
		const roll = mythRolls().find((candidate) => candidate.roll === this.roll);
		return roll ? this.#setMyth(this.number, roll) : Promise.resolve();
	}
}

/** @type {MythChooser|null} One window, whichever Realm it's opened for. */
let chooser = null;

/**
 * Show the Realm's Myths, for the GM to settle.
 * @param {object} options
 * @param {Scene} options.scene The Realm Scene.
 * @param {number|null} [options.number] The Myth to open on, such as the one in the hex the window was opened from.
 * @returns {MythChooser|null} Null for anyone but a GM.
 */
export function openMythChooser({ scene, number = null }) {
	if (!game.user.isGM || !scene) return null;
	chooser ??= new MythChooser();
	if (chooser.sceneId !== scene.id) {
		chooser.sceneId = scene.id;
		chooser.number = null;
		chooser.roll = null;
	}
	// Opened on one Myth, the table opens at its page too, so its neighbours on the roll are there to compare.
	if (Number.isInteger(number)) {
		chooser.number = number;
		const myth = getRealm(scene)?.realm.myths.find((candidate) => candidate.number === number);
		if (myth) chooser.group = myth.d6;
	}
	chooser.render({ force: true });
	return chooser;
}

/**
 * Draw the window again after its Realm changed, such as when the Realm is
 * rolled again under it.
 * @param {string} sceneId
 */
export function refreshMythChooser(sceneId) {
	if (chooser?.rendered && chooser.sceneId === sceneId) renderWhenIdle(chooser);
}

/**
 * Put the window away, once the Realm it was opened for is settled.
 * @returns {Promise<void>}
 */
export async function closeMythChooser() {
	if (chooser?.rendered) await chooser.close();
}
