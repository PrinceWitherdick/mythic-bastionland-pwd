/**
 * Which Seer lives at a Sanctum, chosen by hand. A Sanctum's Seer is rolled
 * on the Knights table (p26), whose page shows the Seer beside the Knight
 * they knighted; this window lays out the Seers of that table, one d6 result
 * at a time or found by name, for the Referee to pick the one who lives there.
 * The Seers who knighted the players' Knights stand above the rest, since a
 * Sanctum the Company might seek out is most often one of theirs.
 */
import { hexLabel } from "../actions/hex-names.js";
import { knightIndex } from "../actions/knight-index.js";
import { inCompany, worldKnights } from "../actions/knights.js";
import { isOwnKnightEntry, ownKnightIndexEntries } from "../actions/own-knights.js";
import { editRealmByHand, getRealm } from "../actions/realm.js";
import { realmKnown } from "../actions/solo.js";
import { seerEntry } from "../book-art/art-index.js";
import { t } from "../chat/cards.js";
import { spreads } from "../rules/book-art.js";
import { seerForKnight } from "../rules/creation.js";
import { isOwnRecord, ownIdOf, ownRef, refOf } from "../rules/knight-refs.js";
import { placeFeature } from "../rules/realm-edits.js";
import { featureAt } from "../rules/realm.js";
import { sameHex } from "../rules/realm-geometry.js";
import { templatePath } from "../system-id.js";
import { BastionlandChooser, OWN_GROUP } from "./BastionlandChooser.js";
import { renderWhenIdle } from "./ui.js";

/**
 * @returns {boolean} Whether two Seers are the same: the same roll on the Knights
 *   table, or the same Seer the Referee wrote.
 */
function sameSeer(a, b) {
	if (!a || !b) return false;
	if (isOwnRecord(a) || isOwnRecord(b)) return a.own === b.own;
	return a.d6 === b.d6 && a.d12 === b.d12;
}

/**
 * The Seers the Referee wrote, each as a card's roll is: in a group of their own, by their ref.
 * @param {object[]} [seers] Seers of the book and written alike, as knightIndex gives them.
 * @returns {{own: string, d6: string, d12: string, roll: string}[]}
 */
const ownSeers = (seers = ownKnightIndexEntries().seers) => seers.filter(isOwnRecord).map(({ own }) => ({ own, d6: OWN_GROUP, d12: "", roll: ownRef(own) }));

/**
 * The Seers who knighted the players' Knights: the one each Knight's sheet
 * names as knighting them, or else the Seer on their own page of the
 * Knights table, the one a new Knight is given.
 * @param {{name: string, system: {seer?: string, knightType?: string}}[]} knights
 * @param {object|null} index The art index, with the Seers the Referee wrote.
 * @returns {{roll: string, knights: string[]}[]} Each Seer once, by their ref (knight-refs.js), in the order
 *   their Knights come, with every Knight they knighted.
 */
export function companySeers(knights, index) {
	const found = new Map();
	for (const knight of knights) {
		const roll = refOf(seerForKnight(index, knight.system));
		if (roll) found.set(roll, [...(found.get(roll) ?? []), knight.name]);
	}
	return [...found].map(([roll, names]) => ({ roll, knights: names }));
}

/** The Referee's window for choosing the Seer who lives at one Sanctum. */
export class SeerChooser extends BastionlandChooser {
	static DEFAULT_OPTIONS = {
		id: "bastionland-seer-chooser",
		position: { width: 760, height: 780 },
		window: { icon: "fa-solid fa-eye" },
		actions: {
			useSeer: SeerChooser.#onUseSeer
		}
	};

	/** The Seers a search looks through: all but the players' Knights' own, shown above them. */
	static SEARCHED = "[data-seer-table]";

	static PARTS = {
		chooser: {
			template: templatePath("apps/seer-chooser.hbs"),
			scrollable: [".bastionland-chooser__grid"]
		}
	};

	/** @type {string|null} The Realm Scene the Sanctum stands on. */
	sceneId = null;

	/** @type {{col: number, row: number}|null} The Sanctum's hex. */
	hex = null;

	/** @returns {Scene|null} */
	get scene() {
		return game.scenes?.get(this.sceneId) ?? null;
	}

	/** @override */
	get title() {
		return t("seerChooser.title");
	}

	/** @returns {object[]} The Realm's Sanctums, those found only where solo play keeps the rest. */
	get #sanctums() {
		const scene = this.scene;
		return (scene ? realmKnown(getRealm(scene)?.realm, scene)?.landmarks ?? [] : []).filter((landmark) => landmark.type === "sanctum");
	}

	/** @returns {object|null} The Sanctum the window was opened for, while it's still one. */
	get #sanctum() {
		return this.#sanctums.find((landmark) => sameHex(landmark.hex, this.hex)) ?? null;
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const sanctums = this.#sanctums;
		const here = this.#sanctum;
		const index = await knightIndex(this.index);
		const own = ownSeers(index.seers);
		const all = [...spreads(), ...own];
		const picked = all.find((roll) => roll.roll === this.roll) ?? null;
		// Without the book, the Seers the Referee wrote are all there are to choose by name.
		if (!this.index && own.length && !this.#openedOnOwn) {
			this.#openedOnOwn = true;
			if (!picked || picked.own) this.group = OWN_GROUP;
		}
		// Another Sanctum may hold the same Seer: they're shown where they live, and can still be chosen.
		const elsewhere = (roll) => sanctums.find((landmark) => landmark !== here && sameSeer(landmark.seer, roll)) ?? null;
		const pickedEntry = picked ? seerEntry(this.index, picked) : null;
		const already = Boolean(picked && sameSeer(here?.seer, picked));
		const at = picked ? elsewhere(picked) : null;
		const card = (roll) => {
			const { name, entry } = seerEntry(this.index, roll);
			const lives = elsewhere(roll);
			return {
				roll: roll.roll,
				d12: roll.d12,
				own: isOwnRecord(roll),
				...this._cardFields(roll, name),
				name,
				img: entry?.path ?? null,
				selected: roll.roll === this.roll,
				here: sameSeer(here?.seer, roll),
				takenLabel: lives ? t("seerChooser.livesAt", { hex: hexLabel(lives.hex, this.scene) }) : null
			};
		};
		// The players' Knights' Seers first, then every other.
		const company = companySeers(worldKnights((actor) => inCompany(actor) && !actor.system.isSquire), index);
		const theirs = new Set(company.map(({ roll }) => roll));

		return Object.assign(context, {
			notice: this.index ? null : t(own.length ? "seerChooser.noIndexOwn" : "seerChooser.noIndex"),
			intro: here ? t("seerChooser.intro", { hex: hexLabel(here.hex, this.scene) }) : t("seerChooser.gone"),
			search: this.search,
			ownGroup: own.length ? { d6: OWN_GROUP, active: this.group === OWN_GROUP } : null,
			company: company.flatMap(({ roll, knights }) => {
				const spread = all.find((each) => each.roll === roll);
				return spread ? [{ ...card(spread), knighted: t("seerChooser.knighted", { knights: knights.join(", ") }) }] : [];
			}),
			// Every other roll is drawn, so a search can find a Seer on any d6 result without drawing the window again.
			cards: all.filter(({ roll }) => !theirs.has(roll)).map(card),
			picked: pickedEntry && {
				name: pickedEntry.name,
				reference: isOwnRecord(picked) ? t("ownKnight.ownReference") : t("seerChooser.reference", { roll: pickedEntry.roll, page: pickedEntry.page }),
				note: already ? t("seerChooser.already") : at ? t("seerChooser.alsoAt", { hex: hexLabel(at.hex, this.scene) }) : null,
				free: Boolean(here) && !already
			},
			// The button is always drawn, only unseen until there's a Seer to give, so picking one moves nothing.
			offer: Boolean(picked && here)
		});
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		// A Seer the Referee writes, renames or deletes.
		this.#journalHooks = ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry"]
			.map((hook) => [hook, Hooks.on(hook, (entry) => isOwnKnightEntry(entry) && renderWhenIdle(this))]);
	}

	/** @override */
	_onClose(options) {
		for (const [hook, id] of this.#journalHooks) Hooks.off(hook, id);
		this.#journalHooks = [];
		super._onClose(options);
	}

	/** @type {[string, number][]} */
	#journalHooks = [];

	/** Whether the window has opened on the Referee's Seers once already, for want of the book's. */
	#openedOnOwn = false;

	/**
	 * A Seer the Referee wrote is shown among theirs once the search is let go.
	 * @override
	 */
	_pickRoll(roll) {
		super._pickRoll(roll);
		if (ownIdOf(roll)) this.group = OWN_GROUP;
	}

	/**
	 * Make the Seer picked the one living at the Sanctum.
	 * @this {SeerChooser}
	 */
	static async #onUseSeer() {
		const own = ownIdOf(this.roll);
		const roll = own ? null : spreads().find((candidate) => candidate.roll === this.roll);
		const scene = this.scene;
		const hex = this.hex;
		if ((!roll && !own) || !scene || !hex) return;
		const seer = own ? { own } : { d6: roll.d6, d12: roll.d12 };
		await editRealmByHand(scene, (realm, g) => {
			const { landmark } = featureAt(realm, hex);
			return landmark?.type === "sanctum" ? placeFeature(realm, g, hex, { kind: "landmark", type: landmark.type, seer }) : realm;
		});
	}
}

/** @type {SeerChooser|null} One window, whichever Sanctum it's opened for. */
let chooser = null;

/**
 * Choose the Seer who lives at a Sanctum, opening on the one there now.
 * @param {object} options
 * @param {Scene} options.scene The Realm Scene.
 * @param {{col: number, row: number}} options.hex The Sanctum's hex.
 * @returns {SeerChooser|null} Null for anyone but a GM.
 */
export function openSeerChooser({ scene, hex }) {
	if (!game.user.isGM || !scene || !hex) return null;
	chooser ??= new SeerChooser();
	chooser.sceneId = scene.id;
	chooser.hex = { col: hex.col, row: hex.row };
	chooser.search = "";
	const realm = getRealm(scene)?.realm;
	const seer = realm ? featureAt(realm, hex).landmark?.seer : null;
	const current = seer ? [...spreads(), ...ownSeers()].find((roll) => sameSeer(roll, seer)) : null;
	chooser.roll = current?.roll ?? null;
	if (current) chooser.group = current.d6;
	chooser.render({ force: true });
	return chooser;
}

/**
 * Draw the window again after its Realm changed, such as a Seer rolled in the hex.
 * @param {string} sceneId
 */
export function refreshSeerChooser(sceneId) {
	if (chooser?.rendered && chooser.sceneId === sceneId) renderWhenIdle(chooser);
}
