/**
 * Settling a Realm's Myths, apart from the roll that made the Realm. Creating
 * a Realm (p14) puts six Myths in remote places and rolls each on the Myths
 * table (p27); which six they are matters more to a Referee than where the
 * rivers ran, so this window lists them and lets them be rolled again, one at
 * a time or all at once, or chosen by hand from the whole table, or from the
 * Myths the Referee has written for themselves. Only which Myth it is
 * changes: each Myth keeps its number and stays in its hex.
 */
import { hexLabel } from "../actions/hex-names.js";
import { newOwnMyth, openOwnMyth, ownMythEntries, readOwnMyth } from "../actions/own-myths.js";
import { editRealmByHand, getRealm } from "../actions/realm.js";
import { mythEntry } from "../book-art/art-index.js";
import { t } from "../chat/cards.js";
import { isDie } from "../rules/book-art.js";
import { isOwnMyth, mythWithOwn } from "../rules/own-myths.js";
import { createRandom, randomSeed } from "../rules/random.js";
import { placeFeature } from "../rules/realm-edits.js";
import { remoteMythHex } from "../rules/realm-generator.js";
import { mythRolls, mythSlots, mythWithRoll, rollFreeMyth, rollMythsAgain } from "../rules/realm-myths.js";
import { searchable } from "../rules/text.js";
import { templatePath } from "../system-id.js";
import { BastionlandChooser } from "./BastionlandChooser.js";
import { confirmDialog, fitCards, renderWhenIdle } from "./ui.js";

/** The group of the table's cards that holds the Referee's own Myths, beside the d6 results. */
const OWN_GROUP = "own";

/** The Myths on one d6 result of the table, one for each face of the d12. */
const D6_RESULT_MYTHS = 12;

/** A fresh source of random numbers for one press of a button. */
const freshRandom = () => createRandom(randomSeed());

/**
 * Put a Myth of the book, or one the Referee wrote, under one of the Realm's
 * numbers, in its hex. Its Omens start unmet: they belong to the Myth, not to the place.
 * @param {object} realm
 * @param {object} g
 * @param {{number: number, hex: object, d6?: number, d12?: number, own?: string}} myth
 * @returns {object} The Realm with it.
 */
const placeMyth = (realm, g, { number, hex, d6, d12, own }) => placeFeature(realm, g, hex, { kind: "myth", number, ...(own ? { own } : { d6, d12 }), omen: 0 });

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
			removeMyth: MythChooser.#onRemoveMyth,
			rollMyth: MythChooser.#onRollMyth,
			rollAll: MythChooser.#onRollAll,
			useRoll: MythChooser.#onUseRoll,
			pickOwn: MythChooser.#onPickOwn,
			writeMyth: () => newOwnMyth(),
			editOwnMyth: MythChooser.#onEditOwnMyth
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

	/** @type {string|null} The Journal entry of the Referee's own Myth picked, in place of a roll. */
	own = null;

	/** @type {ResizeObserver|null} Watches the table for the window being made larger or smaller. */
	#resizing = null;

	/**
	 * A Myth of the book's table picked lets go of one of the Referee's own.
	 * @override
	 */
	_pickRoll(roll) {
		this.own = null;
		super._pickRoll(roll);
	}

	/** @returns {Scene|null} */
	get scene() {
		return game.scenes?.get(this.sceneId) ?? null;
	}

	/** @override */
	get title() {
		return t("mythChooser.title");
	}

	/** @returns {object|null} The Realm whose Myths are being settled. */
	get #realm() {
		const scene = this.scene;
		return scene ? getRealm(scene)?.realm ?? null : null;
	}

	/** @returns {object[]} The Myths the Realm holds, in number order. */
	get #myths() {
		return this.#realm?.myths ?? [];
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const realm = this.#realm;
		const myths = realm?.myths ?? [];
		const slots = realm ? mythSlots(realm) : 0;
		// A window opened before any was chosen settles on the first Myth, or on the first number when there's none.
		if (!isDie(this.number, slots)) this.number = myths[0]?.number ?? (slots ? 1 : null);
		const emptyHere = !myths.some((myth) => myth.number === this.number);
		const written = ownMythEntries();
		// A Myth of the Referee's that's been deleted can't be picked any more.
		const pickedOwn = written.find((entry) => entry.id === this.own) ?? null;
		if (!pickedOwn) this.own = null;
		const picked = pickedOwn ? null : mythRolls().find((roll) => roll.roll === this.roll) ?? null;
		const held = pickedOwn ? mythWithOwn(myths, pickedOwn.id) : picked ? mythWithRoll(myths, picked) : null;
		const chosen = pickedOwn ? this.#ownLine(pickedOwn) : picked ? this.#line(picked) : null;

		return Object.assign(context, {
			notice: this.index ? null : t("mythChooser.noIndex"),
			anyMyths: myths.length > 0,
			// Every number the Realm's Myths go by, one taken out of the Realm left empty to be given another.
			myths: Array.from({ length: slots }, (_, index) => {
				const myth = myths.find((candidate) => candidate.number === index + 1);
				return myth ? this.#line(myth) : this.#emptyLine(index + 1);
			}),
			search: this.search,
			// Every roll is drawn, so a search can find a Myth on any d6 result without drawing the window again.
			cards: mythRolls().map((roll) => {
				const { name, entry } = mythEntry(this.index, roll);
				const inRealm = mythWithRoll(myths, roll);
				return {
					roll: roll.roll,
					d12: roll.d12,
					...this._cardFields(roll, name),
					name,
					img: entry?.path ?? null,
					selected: roll.roll === this.roll,
					taken: Boolean(inRealm),
					takenLabel: inRealm ? t("mythChooser.takenBy", { number: inRealm.number }) : null
				};
			}),
			// The Referee's own Myths make a group of their own after the d6 results, with a card to write another.
			ownGroup: { d6: OWN_GROUP, active: this.group === OWN_GROUP },
			ownCards: written.map((entry) => {
				const inRealm = mythWithOwn(myths, entry.id);
				return {
					own: entry.id,
					d6: OWN_GROUP,
					inGroup: this.group === OWN_GROUP,
					searchText: searchable(entry.name),
					name: entry.name,
					img: readOwnMyth(entry).img || null,
					selected: entry.id === this.own,
					taken: Boolean(inRealm),
					takenLabel: inRealm ? t("mythChooser.takenBy", { number: inRealm.number }) : null
				};
			}),
			writeCard: { d6: OWN_GROUP, inGroup: this.group === OWN_GROUP },
			picked: chosen && {
				...chosen,
				// A Myth already in the Realm can be looked at, but not had twice.
				note: held ? t(held.number === this.number ? "mythChooser.already" : "mythChooser.taken", { number: held.number }) : emptyHere ? t("mythChooser.emptyNote") : null,
				free: !held,
				own: pickedOwn?.id ?? null
			},
			useLabel: this.number === null ? null : t("mythChooser.use", { number: this.number }),
			// The button is always drawn, only unseen until there's a Myth to give, so picking one moves nothing.
			offer: Boolean(chosen && this.number !== null)
		});
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		const root = this.element;
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
		// The Referee's own Myths are drawn the size of the book's, however few have been written.
		const own = this.group === OWN_GROUP && !this.search.trim();
		const count = own ? Math.max(cards.length, D6_RESULT_MYTHS) : cards.length;
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
				count,
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

	/** @override */
	_applySearch() {
		super._applySearch();
		// Fewer Myths found can each be drawn larger.
		this.#fitTable();
	}

	/**
	 * How one Myth reads, whether it's the Realm's, the book's or the Referee's own.
	 * @param {{d6: number|null, d12: number|null, own?: string, number?: number, hex?: object}} myth
	 * @returns {object}
	 */
	#line(myth) {
		const { name, page, roll, entry } = mythEntry(this.index, myth);
		return {
			number: myth.number ?? null,
			name,
			img: entry?.path ?? null,
			hex: myth.hex ? hexLabel(myth.hex, this.scene) : null,
			reference: isOwnMyth(myth) ? t("mythChooser.ownReference") : t("mythChooser.reference", { roll, page }),
			selected: myth.number !== undefined && myth.number === this.number
		};
	}

	/**
	 * A number of the Realm's that holds no Myth, since one was taken out.
	 * @param {number} number
	 * @returns {object}
	 */
	#emptyLine(number) {
		return { number, empty: true, name: t("mythChooser.empty"), img: null, hex: null, reference: t("mythChooser.emptyWhere"), selected: number === this.number };
	}

	/**
	 * How one of the Referee's own Myths reads, picked from the table.
	 * @param {JournalEntry} entry
	 * @returns {object}
	 */
	#ownLine(entry) {
		return { number: null, name: entry.name, img: readOwnMyth(entry).img || null, hex: null, reference: t("mythChooser.ownReference"), selected: false };
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
		await editRealmByHand(scene, edit);
		if (this.rendered) await this.render();
	}

	/**
	 * Put a Myth of the book under one of the Realm's numbers, in the hex that
	 * Myth's number already lies in. Its Omens start unmet: they belong to the
	 * Myth, not to the place. A number with no Myth gets one in a remote hex,
	 * as the Realm's Myths were placed when it was made (p14), hidden.
	 * @param {number|null} number
	 * @param {{d6: number, d12: number}|{own: string}|null} roll A roll on the table, or the Referee's own Myth.
	 * @returns {Promise<void>}
	 */
	async #setMyth(number, roll) {
		const realm = this.#realm;
		if (!realm || !isDie(number, mythSlots(realm)) || !roll) return;
		const myth = realm.myths.find((candidate) => candidate.number === number);
		await this.#edit((realm, g) => {
			const hex = myth?.hex ?? remoteMythHex(freshRandom(), g, realm);
			return hex ? placeMyth(realm, g, { number, hex, ...roll }) : realm;
		});
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
	 * Take a Myth out of the Realm, leaving its hex empty and its number free
	 * for another, once the Referee says so: its Omens met go with it.
	 * @this {MythChooser}
	 */
	static async #onRemoveMyth(_event, target) {
		const number = Number(target.dataset.number);
		const myth = this.#myths.find((candidate) => candidate.number === number);
		if (!myth) return;
		const { name } = mythEntry(this.index, myth);
		const confirmed = await confirmDialog({
			title: t("mythChooser.removeTitle"),
			icon: "fa-solid fa-dragon",
			message: t("mythChooser.removeConfirm", { name: foundry.utils.escapeHTML(name), number }),
			yes: { label: t("mythChooser.removeYes"), icon: "fa-solid fa-xmark" }
		});
		if (!confirmed) return;
		// The number taken out is the one on show, ready to be given another Myth.
		this.number = number;
		await this.#edit((realm, g) => placeFeature(realm, g, myth.hex, null));
	}

	/**
	 * Roll one of the Realm's Myths again, on a Myth the Realm hasn't got, or a
	 * Myth for a number that has none.
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
	 * Give the Myth chosen from the table, or the Referee's own one picked, to the Myth of the Realm on show.
	 * @this {MythChooser}
	 */
	static #onUseRoll() {
		if (this.own) return this.#setMyth(this.number, { own: this.own });
		const roll = mythRolls().find((candidate) => candidate.roll === this.roll);
		return roll ? this.#setMyth(this.number, { d6: roll.d6, d12: roll.d12 }) : Promise.resolve();
	}

	/**
	 * Pick one of the Referee's own Myths.
	 * @this {MythChooser}
	 */
	static #onPickOwn(_event, target) {
		this.own = target.dataset.own;
		this.roll = null;
		this.group = OWN_GROUP;
		return this.render();
	}

	/**
	 * Open the Referee's own Myth picked, to read or change it.
	 * @this {MythChooser}
	 */
	static #onEditOwnMyth() {
		if (this.own) openOwnMyth(this.own);
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
		chooser.own = null;
	}
	// Opened on one Myth, the table opens at its page too, so its neighbours on the roll are there to compare.
	if (Number.isInteger(number)) {
		chooser.number = number;
		const myth = getRealm(scene)?.realm.myths.find((candidate) => candidate.number === number);
		if (myth) chooser.group = isOwnMyth(myth) ? OWN_GROUP : myth.d6;
	}
	chooser.render({ force: true });
	return chooser;
}

/**
 * Draw the window again after its Realm changed, such as when the Realm is
 * rolled again under it, or after one of the Referee's own Myths changed.
 * @param {string|null} [sceneId] The Realm changed, or null for whichever is on show.
 */
export function refreshMythChooser(sceneId = null) {
	if (chooser?.rendered && (sceneId === null || chooser.sceneId === sceneId)) renderWhenIdle(chooser);
}

/**
 * Put the window away, once the Realm it was opened for is settled.
 * @returns {Promise<void>}
 */
export async function closeMythChooser() {
	if (chooser?.rendered) await chooser.close();
}
