import { getCalendar } from "../actions/calendar.js";
import { resolveScar, rollScar } from "../actions/scars.js";
import { knightSquire, takeSquire } from "../actions/squires.js";
import { changeAge } from "../actions/time.js";
import { openKnightChooser } from "../apps/KnightChooser.js";
import { t } from "../chat/cards.js";
import { AGES, GAMBITS, PROPERTY_TYPES } from "../config.js";
import { RANKS } from "../rules/glory.js";
import { isDoomed, isScarPending } from "../rules/scars.js";
import { templatePath } from "../system-id.js";
import { BastionlandActorSheet } from "./BastionlandActorSheet.js";

/** The Knight character sheet, laid out after the official printed sheet. */
export class KnightSheet extends BastionlandActorSheet {
	static DEFAULT_OPTIONS = {
		position: { width: 860, height: 920 },
		actions: {
			chooseKnight: KnightSheet.#onChooseKnight,
			rollScar: KnightSheet.#onRollScar,
			settleScar: KnightSheet.#onSettleScar,
			openSteed: KnightSheet.#onOpenSteed,
			clearSteed: KnightSheet.#onClearSteed,
			setAge: KnightSheet.#onSetAge,
			takeSquire: KnightSheet.#onTakeSquire,
			knightSquire: KnightSheet.#onKnightSquire,
			openSquire: KnightSheet.#onOpenSquire,
			clearSquire: KnightSheet.#onClearSquire
		}
	};

	static PARTS = {
		sheet: {
			template: templatePath("actor/knight-sheet.hbs"),
			scrollable: [""]
		}
	};

	static PREVIEWED_ART = ".bastionland-heraldry img[data-name]";

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const system = this.actor.system;
		const [property, abilities, passions, scars] = await Promise.all([
			this._prepareItems(...PROPERTY_TYPES),
			this._prepareItems("ability"),
			this._prepareItems("passion"),
			this._prepareItems("scar")
		]);
		const calendar = getCalendar();
		const steed = this.#steed();
		const squire = this.#squire();

		return Object.assign(context, {
			isSquire: system.isSquire,
			// A Knight's Squire, or the Knight a Squire serves.
			squire: squire && { name: system.isSquire ? t("squire.serves", { name: squire.name }) : squire.name, img: squire.img },
			squireEmpty: t(system.isSquire ? "squire.servesNobody" : "squire.empty"),
			ages: AGES.map((key) => ({ key, label: t(`age.${key}`), active: system.age === key })),
			ranks: RANKS.map((rank) => ({
				key: rank.key,
				glory: rank.glory,
				label: t(`rank.${rank.key}`),
				active: system.rank === rank.key
			})),
			nextRank: system.nextRank
				? t("sheet.toNextRank", { needed: system.nextRank.needed, rank: t(`rank.${system.nextRank.key}`) })
				: t("sheet.worthiest"),
			propertyTypes: PROPERTY_TYPES.map((type) => ({ type, label: game.i18n.localize(`TYPES.Item.${type}`) })),
			property,
			abilities,
			passions,
			// A Scar still waiting on its GD increase can be settled, and Doom is marked while it lasts.
			scars: scars.map((row) => {
				const { system: scar } = this.actor.items.get(row.id);
				return {
					...row,
					pending: isScarPending(scar),
					tags: isDoomed([scar], calendar) ? [t("scarRoll.doomActive")] : row.tags
				};
			}),
			steed: steed && {
				name: steed.name,
				img: steed.img,
				trample: steed.items
					.filter((item) => item.type === "weapon" && item.system.trample)
					.map((item) => `${item.name} ${item.system.damage}`)
					.join(", ")
			},
			gambits: GAMBITS.map((key) => t(`gambits.${key}`))
		});
	}

	/**
	 * @param {string} uuid
	 * @returns {Actor|null} The actor, if it still exists.
	 */
	static #linked(uuid) {
		const actor = uuid ? fromUuidSync(uuid) : null;
		return actor?.documentName === "Actor" ? actor : null;
	}

	/** @returns {Actor|null} The steed this Knight rides, if it still exists. */
	#steed() {
		return KnightSheet.#linked(this.actor.system.steed);
	}

	/** @returns {Actor|null} A Knight's Squire, or the Knight a Squire serves, if they still exist. */
	#squire() {
		const { system } = this.actor;
		return KnightSheet.#linked(system.isSquire ? system.serves : system.squire);
	}

	/**
	 * Dropping an NPC from the Actors tab makes it the Knight's steed, and
	 * dropping a Squire makes them this Knight's Squire.
	 * @override
	 */
	async _onDropActor(_event, actor) {
		if (!this.isEditable || actor.uuid === this.actor.uuid) return null;
		const squire = actor.type === "knight" && actor.system.isSquire && !this.actor.system.isSquire;
		if (actor.type !== "npc" && !squire) return null;
		if (actor.pack) {
			ui.notifications.warn(t("steed.fromDirectory"));
			return null;
		}
		if (!squire) {
			await this.actor.update({ "system.steed": actor.uuid });
			return actor;
		}
		await this.actor.update({ "system.squire": actor.uuid });
		if (actor.isOwner) await actor.update({ "system.serves": this.actor.uuid });
		return actor;
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {KnightSheet} */
	static #onOpenSteed() {
		return this.#steed()?.sheet.render({ force: true });
	}

	/** @this {KnightSheet} */
	static #onClearSteed() {
		return this.actor.update({ "system.steed": "" });
	}

	/** @this {KnightSheet} */
	static #onChooseKnight() {
		return openKnightChooser(this.actor);
	}

	/** @this {KnightSheet} */
	static #onRollScar() {
		return rollScar(this.actor);
	}

	/** @this {KnightSheet} */
	static #onSettleScar(_event, target) {
		return resolveScar(this.actor, this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId));
	}

	/** @this {KnightSheet} */
	static #onSetAge(_event, target) {
		return changeAge(this.actor, target.dataset.age);
	}

	/** @this {KnightSheet} */
	static #onTakeSquire() {
		return takeSquire(this.actor);
	}

	/** @this {KnightSheet} */
	static #onKnightSquire() {
		return knightSquire(this.actor);
	}

	/** @this {KnightSheet} */
	static #onOpenSquire() {
		return this.#squire()?.sheet.render({ force: true });
	}

	/** @this {KnightSheet} */
	static #onClearSquire() {
		return this.actor.update({ [this.actor.system.isSquire ? "system.serves" : "system.squire"]: "" });
	}
}
