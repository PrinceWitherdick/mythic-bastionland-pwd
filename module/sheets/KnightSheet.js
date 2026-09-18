import { getCalendar } from "../actions/calendar.js";
import { knightDomain, linkKnightDomain, openKnightDomain } from "../actions/dominion.js";
import { postGambit } from "../actions/gambits.js";
import { openKnighthood } from "../actions/knighthood.js";
import { resolveScar, rollScar } from "../actions/scars.js";
import { fillSeerFromBook } from "../actions/seers.js";
import { companySizeNow, knightSquire, takeSquire } from "../actions/squires.js";
import { chooseSuccessor, heirOf } from "../actions/succession.js";
import { changeAge } from "../actions/time.js";
import { openKnightChooser } from "../apps/KnightChooser.js";
import { filePicker } from "../book-art/files.js";
import { t } from "../chat/cards.js";
import { AGES, GAMBITS, PROPERTY_TYPES } from "../config.js";
import { RANKS } from "../rules/glory.js";
import { isDoomed, isScarPending } from "../rules/scars.js";
import { mayTakeSquires } from "../rules/squires.js";
import { templatePath } from "../system-id.js";
import { BastionlandActorSheet } from "./BastionlandActorSheet.js";
import { placeTabRail, stampRailSide } from "./tab-rail.js";

/** The Knight character sheet, laid out after the official printed sheet. */
export class KnightSheet extends BastionlandActorSheet {
	static DEFAULT_OPTIONS = {
		classes: ["bastionland-has-tab-rail"],
		position: { width: 860, height: 920 },
		actions: {
			chooseKnight: KnightSheet.#onChooseKnight,
			postGambit: KnightSheet.#onPostGambit,
			rollScar: KnightSheet.#onRollScar,
			settleScar: KnightSheet.#onSettleScar,
			openSteed: KnightSheet.#onOpenSteed,
			clearSteed: KnightSheet.#onClearSteed,
			setAge: KnightSheet.#onSetAge,
			takeSquire: KnightSheet.#onTakeSquire,
			knightSquire: KnightSheet.#onKnightSquire,
			openSquire: KnightSheet.#onOpenSquire,
			clearSquire: KnightSheet.#onClearSquire,
			nameSuccessor: KnightSheet.#onNameSuccessor,
			openSuccessor: KnightSheet.#onOpenSuccessor,
			clearSuccessor: KnightSheet.#onClearSuccessor,
			paintHeraldry: KnightSheet.#onPaintHeraldry,
			pickSeerImage: KnightSheet.#onPickSeerImage,
			openDomain: KnightSheet.#onOpenDomain,
			showKnighthood: KnightSheet.#onShowKnighthood
		}
	};

	static PARTS = {
		tabs: { template: templatePath("actor/tab-rail.hbs") },
		sheet: {
			template: templatePath("actor/knight-sheet.hbs"),
			scrollable: [""]
		}
	};

	/** The sheet's pages, picked from the rail hung off the window's edge. */
	static TABS = {
		primary: {
			initial: "knight",
			tabs: [
				{ id: "knight", icon: "fa-solid fa-chess-knight", label: "bastionland.sheet.tabs.knight" },
				{ id: "seer", icon: "fa-solid fa-eye", label: "bastionland.sheet.tabs.seer" },
				{ id: "chronicle", icon: "fa-solid fa-feather-pointed", label: "bastionland.sheet.tabs.chronicle" }
			]
		}
	};

	static PREVIEWED_ART = ".bastionland-portrait img[data-name]";

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
		const successor = heirOf(this.actor);
		// Only small Companies may take Squires (p7): say so before anyone asks, and leave the Referee a way round it.
		const companyCount = companySizeNow();
		const [enrichedSeerInfo, enrichedSeerNotes] = await Promise.all([this._enrich(system.seerInfo), this._enrich(system.seerNotes)]);
		const tooLargeForSquires = !system.isSquire && !squire && !mayTakeSquires(companyCount);

		return Object.assign(context, {
			isSquire: system.isSquire,
			// A Knight has one Ability and one Passion; a Squire has neither until Knighted (p7).
			canAddAbility: !system.isSquire && !abilities.length,
			canAddPassion: !system.isSquire && !passions.length,
			// A Knight's Squire, or the Knight a Squire serves.
			squire: squire && { name: system.isSquire ? t("squire.serves", { name: squire.name }) : squire.name, img: squire.img },
			squireEmpty: system.isSquire ? t("squire.servesNobody")
				: tooLargeForSquires ? t(game.user.isGM ? "squire.largeCompanyHintGM" : "squire.largeCompanyHint", { count: companyCount })
					: t("squire.empty"),
			squireBarred: tooLargeForSquires && !game.user.isGM,
			successor: successor && { name: successor.name, img: successor.img },
			ages: AGES.map((key) => ({ key, label: t(`age.${key}`), active: system.age === key })),
			ranks: RANKS.map((rank) => ({
				key: rank.key,
				glory: rank.glory,
				label: t(`rank.${rank.key}`),
				worthy: t(`rank.worthy.${rank.key}`),
				active: system.rank === rank.key
			})),
			worthyOf: system.rank ? t(`rank.worthy.${system.rank}`) : "",
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
			gambits: GAMBITS.map((key) => ({ key, label: t(`gambits.${key}`) })),
			enrichedSeerInfo,
			enrichedSeerNotes
		});
	}

	/** @override */
	_chooseFromBook() {
		openKnightChooser(this.actor, { fresh: true });
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		placeTabRail(this.element, ".bastionland-header");
		this.#fillSeer();
	}

	/** What the Seer fields held when the book was last checked, so the index isn't fetched on every render. */
	#seerChecked = null;

	/** Fill in the Seer's picture and what the book says whenever they're missing or the Seer changes. */
	#fillSeer() {
		const { isSquire, seer, knightType, seerImg, seerInfo } = this.actor.system;
		if (!this.isEditable || isSquire) return;
		const key = JSON.stringify([seer, knightType, seerImg, seerInfo]);
		if (key === this.#seerChecked) return;
		this.#seerChecked = key;
		fillSeerFromBook(this.actor);
	}

	/**
	 * New Knight fills the sheet in from the book, or for a Squire, Knight
	 * Squire raises them. The Domain button opens the Domain this Knight rules,
	 * the way the Stonetop character sheet opens the steading, and reads its
	 * name, or just "Domain" while there isn't one.
	 * @override
	 */
	_headerButtons() {
		const { isSquire } = this.actor.system;
		const buttons = [];
		if (this.isEditable) buttons.push(isSquire
			? { action: "knightSquire", icon: "fa-solid fa-khanda", label: t("squire.knight") }
			: { action: "chooseKnight", icon: "fa-solid fa-chess-knight", label: t("sheet.newKnight"), tooltip: t("sheet.newKnightHint") });
		const domain = knightDomain(this.actor);
		// A Squire rules nothing, and a player who can't found one has nothing to ask for.
		if (!isSquire && (domain || this.actor.isOwner)) buttons.push({
			action: "openDomain",
			icon: "fa-solid fa-chess-rook",
			label: domain?.name ?? t("domain.button"),
			tooltip: t(domain ? "domain.openHint" : "domain.foundHint"),
			muted: !domain
		});
		return buttons;
	}

	/**
	 * The rail changes sides when the window is dragged near the screen's edge.
	 * @override
	 */
	_onPosition(position) {
		super._onPosition(position);
		stampRailSide(this.element, position);
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
	 * Dropping an NPC from the Actors tab makes it the Knight's steed, dropping
	 * a Squire makes them this Knight's Squire, dropping another Knight names
	 * them this Knight's successor, and dropping a Domain makes it the one they rule.
	 * @override
	 */
	async _onDropActor(_event, actor) {
		if (!this.isEditable || actor.uuid === this.actor.uuid) return null;
		if (actor.type === "domain") {
			if (this.actor.system.isSquire) return null;
			if (actor.pack) {
				ui.notifications.warn(t("domain.fromDirectory"));
				return null;
			}
			await linkKnightDomain(this.actor, actor);
			return actor;
		}
		const squire = actor.type === "knight" && actor.system.isSquire && !this.actor.system.isSquire;
		if (actor.type === "knight" && !squire) {
			if (this.actor.system.isSquire || actor.pack) return null;
			await this.actor.update({ "system.successor": actor.uuid });
			return actor;
		}
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
	static #onPostGambit(_event, target) {
		return postGambit(this.actor, target.dataset.gambit);
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
	static async #onPaintHeraldry() {
		// Loaded on first use: the painter and its gallery of charges are large, and most sessions never open them.
		const { openHeraldryPainter } = await import("../apps/HeraldryPainter.js");
		return openHeraldryPainter(this.actor);
	}

	/** @this {KnightSheet} */
	static #onPickSeerImage() {
		const picker = new (filePicker())({
			type: "image",
			current: this.actor.system.seerImg,
			callback: (path) => this.actor.update({ "system.seerImg": path })
		});
		return picker.render({ force: true });
	}

	/** @this {KnightSheet} */
	static #onOpenDomain() {
		return openKnightDomain(this.actor);
	}

	/** @this {KnightSheet} */
	static #onShowKnighthood() {
		return openKnighthood(this.actor);
	}

	/** @this {KnightSheet} */
	static #onNameSuccessor() {
		return chooseSuccessor(this.actor);
	}

	/** @this {KnightSheet} */
	static #onOpenSuccessor() {
		return heirOf(this.actor)?.sheet.render({ force: true });
	}

	/** @this {KnightSheet} */
	static #onClearSuccessor() {
		return this.actor.update({ "system.successor": "" });
	}

	/** @this {KnightSheet} */
	static #onClearSquire() {
		return this.actor.update({ [this.actor.system.isSquire ? "system.serves" : "system.squire"]: "" });
	}
}
