import { getCalendar } from "../actions/calendar.js";
import { knightDomain, linkKnightDomain, openKnightDomain } from "../actions/dominion.js";
import { fillKnightFromBook, withTableSentences } from "../actions/knight-tables.js";
import { postGambit } from "../actions/gambits.js";
import { openKnighthood } from "../actions/knighthood.js";
import { resolveScar, rollScar } from "../actions/scars.js";
import { companySizeNow, knightSquire, takeSquire } from "../actions/squires.js";
import { chooseSuccessor, heirOf } from "../actions/succession.js";
import { changeAge } from "../actions/time.js";
import { openKnightChooser } from "../apps/KnightChooser.js";
import { openKnightTable } from "../apps/KnightTable.js";
import { filePicker } from "../book-art/files.js";
import { openLedger } from "../apps/LedgerWindow.js";
import { t } from "../chat/cards.js";
import { AGES, GAMBITS, PROPERTY_TYPES } from "../config.js";
import { RANKS } from "../rules/glory.js";
import { hasTable, knightTableItemId, namePartsWithoutSeeBelow, tableResults } from "../rules/knight-tables.js";
import { isDoomed, isScarPending } from "../rules/scars.js";
import { mayTakeSquires } from "../rules/squires.js";
import { templatePath } from "../system-id.js";
import { BastionlandActorSheet } from "./BastionlandActorSheet.js";
import { watchPromptLines } from "./prompt-breaks.js";
import { SETTINGS_TAB_ENTRY, SettingsTabMixin, isOwnCharacter } from "./settings-tab.js";
import { placeTabRail, stampRailSide } from "./tab-rail.js";

/**
 * The Knight character sheet, laid out after the official printed sheet, with
 * the player's own settings on a page of its own.
 */
export class KnightSheet extends SettingsTabMixin(BastionlandActorSheet) {
	static DEFAULT_OPTIONS = {
		classes: ["bastionland-has-tab-rail"],
		position: { width: 860, height: 920 },
		actions: {
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
			showKnighthood: KnightSheet.#onShowKnighthood,
			openKnightTable: KnightSheet.#onOpenKnightTable,
			openLedger: KnightSheet.#onOpenLedger
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
				{ id: "chronicle", icon: "fa-solid fa-feather-pointed", label: "bastionland.sheet.tabs.chronicle" },
				// Only on a Knight that is the reader's own.
				SETTINGS_TAB_ENTRY
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
		// The table on their page opens from the possession that says "see below", and
		// what it gave shows right under it, so the name needn't say "see below" too.
		const bookTable = this.#bookTableContext();
		const tableItem = bookTable && knightTableItemId(this.actor);
		const propertyRows = tableItem
			? property.map((row) => (row.id === tableItem ? { ...row, ...namePartsWithoutSeeBelow(row), bookTable } : row))
			: property;

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
			property: propertyRows,
			// A table about the Knight themself, which no possession points to, gets a row of its own.
			bookTableRow: tableItem ? null : bookTable,
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

	/**
	 * The Settings page is shown on the reader's own Knight.
	 * @override
	 */
	_showsSettingsTab(user) {
		return isOwnCharacter(this.actor, user);
	}

	/** @override */
	_chooseFromBook() {
		openKnightChooser(this.actor, { fresh: true });
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		placeTabRail(this.element, ".bastionland-header");
		watchPromptLines(this.element);
		this.#fillFromBook();
	}

	/**
	 * The table on the Knight's page, as their Property shows it: a die that
	 * opens the table in its own window, and what it gave.
	 * @returns {{name: string, tooltip: string, results: {column: string, entry: string}[]}|null}
	 */
	#bookTableContext() {
		const stored = this.actor.system.bookTable;
		if (this.actor.system.isSquire || !hasTable(stored)) return null;
		return {
			name: stored.name,
			tooltip: t(this.isEditable ? "knightTable.open" : "knightTable.view", { name: stored.name }),
			results: withTableSentences(stored, tableResults(stored))
		};
	}

	/** Who the Knight was when the book was last checked for their table. */
	#tableChecked = null;

	/** What the Seer fields held when the book was last checked, so the index isn't fetched on every render. */
	#seerChecked = null;

	/**
	 * Fill in the Seer's picture and what the book says whenever they're missing
	 * or the Seer changes, and take the table on the Knight's page whenever they
	 * hold none, or another Knight's.
	 */
	#fillFromBook() {
		const { isSquire, knightType, bookTable, seer, seerImg, seerInfo } = this.actor.system;
		if (!this.isEditable || isSquire) return;
		const tableKey = JSON.stringify([knightType, bookTable.knight, bookTable.name]);
		const seerKey = JSON.stringify([seer, knightType, seerImg, seerInfo]);
		const parts = { seer: seerKey !== this.#seerChecked, table: tableKey !== this.#tableChecked };
		this.#seerChecked = seerKey;
		this.#tableChecked = tableKey;
		fillKnightFromBook(this.actor, parts);
	}

	/**
	 * A Squire's sheet has Knight Squire, which raises them. The Domain button opens the Domain this Knight rules,
	 * the way the Stonetop character sheet opens the steading, and reads its
	 * name, or just "Domain" while there isn't one. The Ledger button opens every
	 * change made to them.
	 * @override
	 */
	_headerButtons() {
		const { isSquire } = this.actor.system;
		const buttons = [];
		if (this.isEditable && isSquire) buttons.push({ action: "knightSquire", icon: "fa-solid fa-khanda", label: t("squire.knight") });
		const domain = knightDomain(this.actor);
		// A Squire rules nothing, and a player who can't found one has nothing to ask for.
		if (!isSquire && (domain || this.actor.isOwner)) buttons.push({
			action: "openDomain",
			icon: "fa-solid fa-chess-rook",
			label: domain?.name ?? t("domain.button"),
			tooltip: t(domain ? "domain.openHint" : "domain.foundHint"),
			muted: !domain
		});
		// Every change made to the Knight, as the Stonetop character sheet keeps one.
		buttons.push({ action: "openLedger", icon: "fa-solid fa-scroll", label: t("ledger.button"), tooltip: t("ledger.buttonHint") });
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

	/**
	 * The table on the Knight's page opens in its own window, to roll on or,
	 * for someone who can only see the Knight, to read.
	 * @this {KnightSheet}
	 */
	static #onOpenKnightTable() {
		return openKnightTable(this.actor);
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
	static #onOpenLedger() {
		return openLedger(this.actor);
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
