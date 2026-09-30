import { CALENDAR_HOOK, getCalendar } from "../actions/calendar.js";
import { knightDomain, linkKnightDomain, openKnightDomain } from "../actions/dominion.js";
import { fillKnightFromBook, knightTableRenewal, withTableSentences } from "../actions/knight-tables.js";
import { postGambit } from "../actions/gambits.js";
import { openKnighthood } from "../actions/knighthood.js";
import { fillKnightByHand, giveKnightTo, isUnchosen, knightPlayer } from "../actions/new-knight.js";
import { takeSeerDamage } from "../actions/damage.js";
import { rollSaveFor } from "../actions/saves.js";
import { canPatchUp, patchUp, resolveScar, rollScar } from "../actions/scars.js";
import { companySizeNow, isChoosingKnight, knightSquire, takeSquire } from "../actions/squires.js";
import { renameSteed, takeSteed } from "../actions/steeds.js";
import { chooseSuccessor, heirOf } from "../actions/succession.js";
import { changeAge } from "../actions/time.js";
import { openPortrait } from "../apps/ArtPopout.js";
import { openKnightChooser } from "../apps/KnightChooser.js";
import { openKnightTable } from "../apps/KnightTable.js";
import { actorFrame } from "../apps/PortraitFrame.js";
import { openLedger } from "../apps/LedgerWindow.js";
import { pickImageInto } from "../book-art/files.js";
import { t } from "../chat/cards.js";
import { AGES, GAMBITS, LINKED_ACTORS, PROPERTY_TYPES } from "../config.js";
import { titleKnightType } from "../rules/creation.js";
import { RANKS } from "../rules/glory.js";
import { hasTable, knightRenewal, knightTableItemId, namePartsWithoutSeeBelow, clauseMidSentence, splitAtRenewal, tableResults } from "../rules/knight-tables.js";
import { CARRIER_ICONS, propertyTabIcon } from "../rules/property-tab.js";
import { portraitStyle } from "../rules/portrait-frame.js";
import { isDoomed, isScarPending, scarForRoll } from "../rules/scars.js";
import { SEER_UNHARMED, seerCurrent } from "../rules/seer-state.js";
import { mayTakeSquires, squireTabs } from "../rules/squires.js";
import { BREED_FLAG, steedBreedShown } from "../rules/steeds.js";
import { compareCalendars } from "../rules/time.js";
import { SCORES, VIRTUES } from "../rules/virtues.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { BastionlandActorSheet } from "./BastionlandActorSheet.js";
import { SETTINGS_TAB_ENTRY, SettingsTabMixin, isOwnCharacter } from "./settings-tab.js";
import { placeTabRail, stampRailSide } from "./tab-rail.js";

/**
 * The Knight character sheet, laid out after the official printed sheet, with
 * the player's own settings on a page of its own.
 *
 * A Squire is the same Actor, so Knighting them is an update rather than a new
 * document, and the same sheet, drawn as the one page p7 gives them; see
 * templates/actor/squire-sheet.hbs.
 */
export class KnightSheet extends SettingsTabMixin(BastionlandActorSheet) {
	/** @override */
	static PROPERTY_ORDER = true;

	static DEFAULT_OPTIONS = {
		classes: ["bastionland-has-tab-rail"],
		position: { width: 860, height: 920 },
		actions: {
			postGambit: KnightSheet.#onPostGambit,
			rollScar: KnightSheet.#onRollScar,
			settleScar: KnightSheet.#onSettleScar,
			patchUp: KnightSheet.#onPatchUp,
			openSteed: KnightSheet.#onOpenSteed,
			clearSteed: KnightSheet.#onClearSteed,
			takeSteed: KnightSheet.#onTakeSteed,
			renameSteed: KnightSheet.#onRenameSteed,
			setAge: KnightSheet.#onSetAge,
			takeSquire: KnightSheet.#onTakeSquire,
			chooseKnight: KnightSheet.#onChooseKnight,
			chooseKnighted: KnightSheet.#onChooseKnighted,
			chooseFresh: KnightSheet.#onChooseFresh,
			fillByHand: KnightSheet.#onFillByHand,
			knightSquire: KnightSheet.#onKnightSquire,
			openSquire: KnightSheet.#onOpenSquire,
			clearSquire: KnightSheet.#onClearSquire,
			nameSuccessor: KnightSheet.#onNameSuccessor,
			openSuccessor: KnightSheet.#onOpenSuccessor,
			clearSuccessor: KnightSheet.#onClearSuccessor,
			paintHeraldry: KnightSheet.#onPaintHeraldry,
			pickSeerImage: KnightSheet.#onPickSeerImage,
			rollSeerSave: KnightSheet.#onRollSeerSave,
			takeSeerDamage: KnightSheet.#onTakeSeerDamage,
			restoreSeer: KnightSheet.#onRestoreSeer,
			toggleSeerMortalWound: KnightSheet.#onToggleSeerMortalWound,
			openPortrait: KnightSheet.#onOpenPortrait,
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

	/** A Squire's own page, in place of the Knight's, under the figure from their portrait. */
	static SQUIRE_TAB = Object.freeze({ id: "squire", icon: CARRIER_ICONS.squire, label: "bastionland.sheet.tabs.squire" });

	/** The sheet's pages, picked from the rail hung off the window's edge. */
	static TABS = {
		primary: {
			initial: "knight",
			tabs: [
				// `squire: false` on a page a Squire has no use for (p7): their own page
				// stands in for the Knight's, they carry their own things rather than
				// keeping a Property page, and nobody has Knighted them, so there's no Seer.
				{ id: "knight", icon: "fa-solid fa-chess-knight", label: "bastionland.sheet.tabs.knight", squire: false },
				// Its icon changes with whatever carries the Knight's things; see _prepareTabs.
				{ id: "property", icon: CARRIER_ICONS.back, label: "bastionland.sheet.tabs.property", squire: false },
				{ id: "seer", icon: "fa-solid fa-eye", label: "bastionland.sheet.tabs.seer", squire: false },
				{ id: "chronicle", icon: "fa-solid fa-feather-pointed", label: "bastionland.sheet.tabs.chronicle" },
				// Only on a Knight that is the reader's own.
				SETTINGS_TAB_ENTRY
			]
		}
	};

	static PREVIEWED_ART = ".bastionland-portrait img[data-name]";

	/**
	 * A chosen Knight is titled as the book styles them, "Eve the Silk Knight",
	 * in place of "Knight: Eve"; a Squire and an unchosen Knight keep the plain title.
	 * @override
	 */
	get title() {
		const type = titleKnightType(this.actor.system);
		return type ? t("sheet.knightTitle", { name: this.actor.name, type }) : super.title;
	}

	/**
	 * Foundry retitles the window only when the name changes, so a new Knight
	 * type, or a Squire Knighted, retitles it too.
	 * @override
	 */
	_configureRenderOptions(options) {
		super._configureRenderOptions(options);
		const changes = options.renderData?.system;
		if (this.hasFrame && options.renderContext && changes && ("knightType" in changes || "isSquire" in changes)) {
			options.window = Object.assign(options.window ?? {}, { title: this.title });
		}
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const system = this.actor.system;
		const [property, abilities, passions, scars] = await Promise.all([
			this._preparePropertyItems(...PROPERTY_TYPES),
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
		// The Seer's scores are drawn apart from the text, so each Virtue can roll a Save.
		const seer = system.seerBook;
		const [enrichedSeerInfo, enrichedSeerNotes] = await Promise.all([this._enrich(system.seerInfo), this._enrich(system.seerNotes)]);
		const tooLargeForSquires = !system.isSquire && !squire && !mayTakeSquires(companyCount);
		// The table on their page opens from the possession that says "see below", and
		// what it gave shows right under it, so the name needn't say "see below" too.
		const bookTable = this.#bookTableContext();
		const tableItem = bookTable && knightTableItemId(this.actor);
		const propertyRows = tableItem
			? await Promise.all(property.map((row) => (row.id === tableItem ? this.#tableItemRow(row, bookTable) : row)))
			: property;

		return Object.assign(context, {
			// The part of the picture chosen in the portrait window's Frame, if any.
			portraitStyle: portraitStyle(this.actor.img, actorFrame(this.actor)),
			isSquire: system.isSquire,
			// A Knight has one Ability and one Passion; a Squire has neither until Knighted (p7).
			canAddAbility: !system.isSquire && !abilities.length,
			canAddPassion: !system.isSquire && !passions.length,
			// A Knight's Squire, or, on a Squire's own page, the Knight they serve.
			squire: squire && { name: squire.name, img: squire.img },
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
			// A Scar still waiting on its GD increase can be settled, Doom is marked while it
			// lasts, and a Humiliation names whoever its revenge is owed on.
			scars: scars.map((row) => {
				const { system: scar } = this.actor.items.get(row.id);
				const pending = isScarPending(scar);
				const owed = pending && scarForRoll(scar.roll)?.byRevenge && scar.foeName ? [t("revenge.owedTag", { name: scar.foeName })] : null;
				return {
					...row,
					pending,
					tags: isDoomed([scar], calendar) ? [t("scarRoll.doomActive")] : owed ?? row.tags
				};
			}),
			// A few moments' care patches them up (p8), which settles a Gouge or Tear too (p9).
			canPatchUp: canPatchUp(this.actor),
			steed: steed && {
				name: steed.name,
				img: steed.img,
				breed: steedBreedShown(steed.name, steed.getFlag(SYSTEM_ID, BREED_FLAG)),
				renamable: steed.isOwner,
				trample: steed.items
					.filter((item) => item.type === "weapon" && item.system.trample)
					.map((item) => `${item.name} ${item.system.damage}`)
					.join(", ")
			},
			gambits: GAMBITS.map((key) => ({ key, label: t(`gambits.${key}`) })),
			seerStats: seer && this.#seerScores(seer),
			enrichedSeerInfo,
			enrichedSeerNotes,
			unchosen: isUnchosen(this.actor) && this.#unchosenContext()
		});
	}

	/**
	 * What the empty page of a Knight made blank says, and, for a GM, the
	 * players they can give the Knight to for choosing (p6).
	 * @returns {{hint: string, players: {id: string, name: string, selected: boolean}[]}}
	 */
	#unchosenContext() {
		const hint = !this.isEditable ? "unchosen.hintViewer" : game.user.isGM ? "unchosen.hintGM" : "unchosen.hint";
		const holder = knightPlayer(this.actor);
		const players = game.user.isGM
			? game.users.filter((user) => !user.isGM).map((user) => ({ id: user.id, name: user.name, selected: user.id === holder }))
			: [];
		return { hint: t(hint), players };
	}

	/**
	 * A Squire's sheet is the one page p7 gives them, in place of the Knight's
	 * four, and a Knight made blank shows an empty page until they're chosen.
	 * Read afresh on every render, so Knighting or choosing them turns the page over.
	 * @override
	 */
	_configureRenderParts(options) {
		const parts = super._configureRenderParts(options);
		if (this.actor.system.isSquire) parts.sheet.template = templatePath("actor/squire-sheet.hbs");
		else if (isUnchosen(this.actor)) parts.sheet.template = templatePath("actor/knight-unchosen.hbs");
		return parts;
	}

	/**
	 * A Squire's rail leads with their own page and drops the Knight's pages
	 * they've no use for. A Knight still to be chosen has no rail.
	 * @override
	 */
	_getTabsConfig(group) {
		const config = super._getTabsConfig(group);
		if (group !== "primary" || !config) return config;
		// The empty page is the only one until they're chosen.
		if (isUnchosen(this.actor)) return { ...config, tabs: [] };
		if (!this.actor.system.isSquire) return config;
		return { ...config, initial: KnightSheet.SQUIRE_TAB.id, tabs: squireTabs(config.tabs, KnightSheet.SQUIRE_TAB) };
	}

	/**
	 * The Property tab shows what carries the Knight's things: a horse while
	 * they ride a steed, their Squire while one serves them, else a backpack. A
	 * Squire carries their own.
	 * @override
	 */
	_prepareTabs(group) {
		const tabs = super._prepareTabs(group);
		if (tabs.property) tabs.property.icon = propertyTabIcon({ steed: this.#steed(), squire: !this.actor.system.isSquire && this.#squire() });
		return tabs;
	}

	/**
	 * The Settings page is shown on the reader's own Knight.
	 * @override
	 */
	_showsSettingsTab(user) {
		return isOwnCharacter(this.actor, user);
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		placeTabRail(this.element, ".bastionland-header");
		this.#fillFromBook();
		// Picking a player on a Knight's empty page gives them the Knight; it isn't a field of the Actor's.
		this.element.querySelector(".bastionland-unchosen__player select")?.addEventListener("change", (event) => {
			event.stopPropagation();
			giveKnightTo(this.actor, event.currentTarget.value);
		});
	}

	/**
	 * The possession a Knight's table sits under, without its "see below". Where
	 * it says the table comes round again, as the Dust Knight's fish are restocked
	 * each new Season, the die moves into its aside right after those words, and
	 * is marked once that time has come since the last roll.
	 * @param {object} row From _prepareItems.
	 * @param {object} bookTable From #bookTableContext.
	 * @returns {Promise<object>}
	 */
	async #tableItemRow(row, bookTable) {
		const shown = { ...row, ...namePartsWithoutSeeBelow(row), bookTable };
		const renewal = knightTableRenewal(this.actor);
		if (!renewal) return shown;
		// With the die gone up into the aside, the line under keeps only what the table gave, if anything.
		const table = { ...bookTable, inlineDie: true, dieless: !bookTable.results.length };
		const die = {
			due: renewal.due,
			tooltip: renewal.due ? t("knightTable.renewal.due", { name: bookTable.name, when: renewal.clause }) : bookTable.tooltip
		};
		if (renewal.source === "name") {
			const split = splitAtRenewal(shown.nameRest, renewal);
			if (!split) return shown;
			return { ...shown, nameRest: split.before, renewal: { ...die, after: split.after }, bookTable: table };
		}
		// Said in the notes, it joins the tags' brackets instead, and leaves the notes.
		const description = await this._enrich(this.actor.items.get(row.id).system.description.replace(renewal.paragraph, ""));
		return { ...shown, description, renewal: { ...die, clause: clauseMidSentence(renewal.clause), inTags: true }, bookTable: table };
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

	/**
	 * The Seer's scores as they stand, each out of what the book gives them.
	 * Each Virtue rolls their Save.
	 * @param {object} stats The Knight's `seerBook`.
	 * @returns {object}
	 */
	#seerScores(stats) {
		const { seer, seerState } = this.actor.system;
		const now = seerCurrent(stats, seerState);
		const name = seer || t("seer.label");
		return {
			scores: SCORES.filter((key) => Number.isInteger(stats[key])).map((key) => {
				const virtue = key !== "guard";
				const label = t(virtue ? `virtues.${key}.label` : "guard.label");
				return {
					key,
					abbr: t(virtue ? `virtues.${key}.abbr` : "guard.abbr"),
					value: now[key],
					max: stats[key],
					label: `${label} ${t("sheet.current")}`,
					rollLabel: virtue ? t("seer.rollSave", { virtue: label, name }) : null
				};
			}),
			mortalWound: {
				active: seerState.mortalWound,
				label: t("conditions.mortalWound.label"),
				hint: t("conditions.mortalWound.hint")
			},
			takeDamage: t("seer.takeDamage", { name }),
			restore: t("seer.restore")
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
	 * New Knight fills the sheet in from the book, or for a Squire, Knight
	 * Squire raises them. The Domain button opens the Domain this Knight rules,
	 * the way the Stonetop character sheet opens the steading, and reads its
	 * name, or just "Domain" while there isn't one. The Ledger button opens every
	 * change made to them. A Knight still to be chosen has only the Ledger.
	 * @override
	 */
	_headerButtons() {
		const { isSquire } = this.actor.system;
		// Every change made to the Knight, as the Stonetop character sheet keeps one.
		const ledger = { action: "openLedger", icon: "fa-solid fa-scroll", label: t("ledger.button"), tooltip: t("ledger.buttonHint") };
		// A Knight still to be chosen has the chooser on their page, and no Domain yet.
		if (isUnchosen(this.actor)) return [ledger];
		const buttons = [];
		if (this.isEditable) buttons.push(isSquire
			? { action: "knightSquire", icon: "fa-solid fa-khanda", label: t("squire.knight") }
			// A Squire just Knighted adds the Knight they became rather than being made over.
			: isChoosingKnight(this.actor)
				? { action: "chooseKnighted", icon: "fa-solid fa-chess-knight", label: t("sheet.chooseKnighted"), tooltip: t("sheet.chooseKnightedHint") }
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
		buttons.push(ledger);
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
	 * Keep the steed, Squire and successor shown here in step with their own
	 * sheets, so renaming the steed there renames it here. A hook rather than
	 * their `apps`, as deleting a document closes every window in its `apps`.
	 * @override
	 */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		const redraw = (actor) => {
			const system = this.actor.system;
			if (LINKED_ACTORS.some(({ key }) => system[key] === actor.uuid)) this.render();
		};
		this._watchHooks(["updateActor", "deleteActor"], redraw);
		// The Knight's table shows due once it comes round, or no longer due once the calendar is set back.
		this._watchHooks([CALENDAR_HOOK], (after, before, turned) => {
			const renewal = knightRenewal(this.actor);
			if (renewal && (turned.includes(renewal.cadence) || compareCalendars(after, before) < 0)) this.render();
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
	static #onRenameSteed() {
		return renameSteed(this.#steed());
	}

	/** @this {KnightSheet} */
	static #onTakeSteed() {
		return takeSteed(this.actor);
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
	static #onPatchUp() {
		return patchUp(this.actor);
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
	static #onChooseKnight() {
		return openKnightChooser(this.actor);
	}

	/** @this {KnightSheet} */
	static #onChooseKnighted() {
		return openKnightChooser(this.actor, { knighting: true });
	}

	/** @this {KnightSheet} */
	static #onChooseFresh() {
		// Nothing on the sheet yet to be replaced, so the chooser doesn't ask first.
		return openKnightChooser(this.actor, { fresh: true });
	}

	/** @this {KnightSheet} */
	static #onFillByHand() {
		return fillKnightByHand(this.actor);
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

	/**
	 * The Seer has no Actor, so their Save is rolled against the score on their page.
	 * @this {KnightSheet}
	 */
	static #onRollSeerSave(_event, target) {
		const { seer, seerBook, seerState } = this.actor.system;
		const { virtue } = target.dataset;
		if (!VIRTUES.includes(virtue)) return;
		const value = seerCurrent(seerBook, seerState)[virtue];
		if (!Number.isInteger(value)) return;
		return rollSaveFor(seer || t("seer.label"), virtue, value);
	}

	/** @this {KnightSheet} */
	static #onTakeSeerDamage() {
		return takeSeerDamage(this.actor);
	}

	/**
	 * The Seer back at the book's scores, without a Mortal Wound.
	 * @this {KnightSheet}
	 */
	static #onRestoreSeer() {
		return this.actor.update({ "system.seerState": { ...SEER_UNHARMED } });
	}

	/** @this {KnightSheet} */
	static #onToggleSeerMortalWound() {
		return this.actor.update({ "system.seerState.mortalWound": !this.actor.system.seerState.mortalWound });
	}

	/** @this {KnightSheet} */
	static #onPickSeerImage() {
		return pickImageInto(this.actor, "system.seerImg", "image");
	}

	/**
	 * The picture opens larger, with Change Picture and Frame in its header
	 * as in Stonetop. With no picture yet there's nothing to enlarge, so it
	 * goes straight to choosing one.
	 * @this {KnightSheet}
	 */
	static #onOpenPortrait() {
		if (this.actor.img && this.actor.img !== Actor.implementation.DEFAULT_ICON) return openPortrait(this.actor);
		if (!this.isEditable) return;
		return pickImageInto(this.actor);
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
