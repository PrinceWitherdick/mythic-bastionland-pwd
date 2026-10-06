import { kitWeaponNames } from "../actions/abilities.js";
import { createKnightWithCompanions, rollStartScores } from "../actions/new-knight.js";
import { clearCompanions, knightOwner, makeCompanions } from "../actions/property.js";
import { findByRoll } from "../book-art/art-index.js";
import { peekVerseForEntry } from "../book-art/myth-tables.js";
import { postCard, t } from "../chat/cards.js";
import { PROPERTY_TYPES } from "../config.js";
import { KNIGHT_VERSE_VERSION, spreads } from "../rules/book-art.js";
import { COMPANY_START_FLAG, realmStart } from "../rules/company.js";
import { replacementGlory } from "../rules/fallen.js";
import { rollKnightName, startingName } from "../rules/knight-names.js";
import { CHOOSING_FLAG, isSquireName, itemsGained, knightedChoice } from "../rules/squires.js";
import {
	DEFAULT_START,
	STANDARD_KIT,
	STARTS,
	knightItems,
	knightUpdate,
	startFor,
	takenKnights
} from "../rules/creation.js";
import { midSentence } from "../rules/text.js";
import { UNCHOSEN_FLAG } from "../rules/unchosen-knight.js";
import { SCORES, VIRTUES, VIRTUE_MAX, clampVirtue } from "../rules/virtues.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { BastionlandChooser } from "./BastionlandChooser.js";
import { confirmDialog, renderWhenIdle } from "./ui.js";
import { allowsDuplicateKnights, knightRows, worldKnights } from "../actions/knights.js";

/** Items a chosen Knight's Property, Ability and Passion replace. Scars stay. */
const REPLACED_TYPES = Object.freeze([...PROPERTY_TYPES, "ability", "passion"]);

/**
 * How many pixels wider the window grows to show the Knights to pick from. Their
 * column opens as wide as the chosen Knight's, which widens a little with it:
 * room for four Knights to a row, each picture whole.
 */
const BROWSE_WIDTH = 620;

/**
 * Makes a Knight the way the book does (p6-7, p26): choose a Start, roll
 * Virtues and GD, then roll d6 and d12 for the Knight or pick one. It fills in
 * an existing Knight, or creates a new one. For a Squire just Knighted, it only
 * rolls or picks the Knight they became, and keeps everything they have (p7).
 */
export class KnightChooser extends BastionlandChooser {
	/**
	 * @param {object} [options]
	 * @param {boolean} [options.knighting] The actor is a Squire just Knighted, whose scores and gear stay.
	 * @param {{lowest: number, highest: number}|null} [options.companyGlory] The Glory of the Company a Knight made
	 *   in place of one who fell joins, so they may start with some (p195).
	 * @param {boolean} [options.replacement] The Knight is made in place of one who fell.
	 */
	constructor({ knighting = false, companyGlory = null, replacement = false, ...options } = {}) {
		super(options);
		this.#knighting = Boolean(this.actor && knighting);
		this.#companyGlory = companyGlory;
		// A new Knight joins the Company as it began (p6), but one made in place of
		// a fallen Knight starts as a Young Knight-Errant in most cases (p195).
		this.#start = replacement ? DEFAULT_START : companyStartKey();
		// A Squire still named for the Knight they served starts without one, as a Knight made blank does.
		if (this.#knighting && isSquireName(this.#name, t("squire.name"))) this.#name = "";
	}

	static DEFAULT_OPTIONS = {
		tag: "form",
		classes: ["bastionland-knight-chooser"],
		position: { width: 822, height: 1000 },
		window: { icon: "fa-solid fa-chess-knight" },
		form: { handler: KnightChooser.#onChangeForm, submitOnChange: true, closeOnSubmit: false },
		actions: {
			setStart: KnightChooser.#onSetStart,
			rollScores: KnightChooser.#onRollScores,
			rollKnight: KnightChooser.#onRollKnight,
			rollName: KnightChooser.#onRollName,
			browse: KnightChooser.#onBrowse,
			toggleSearch: KnightChooser.#onToggleSearch,
			apply: KnightChooser.#onApply
		}
	};

	/** Every picture in the grid, the picked one too: the window may be too narrow to show its large copy beside them. */
	static PREVIEWED_ART = ".bastionland-chooser__card img.bastionland-chooser__thumb";

	static PARTS = {
		chooser: {
			template: templatePath("apps/knight-chooser.hbs"),
			scrollable: [".bastionland-chooser__grid", ".bastionland-chooser__detail"]
		}
	};

	#start = DEFAULT_START;

	/** Whether this is a Squire just Knighted, choosing the Knight they became. */
	#knighting = false;

	/** @type {{lowest: number, highest: number}|null} The Glory of the Company a Knight made in place of one who fell joins. */
	#companyGlory = null;

	/** @type {number|null} The Glory typed in for them, or null for what's suggested. */
	#glory = null;

	/** @type {Record<string, number|null>} */
	#scores = Object.fromEntries(SCORES.map((key) => [key, null]));

	/** Whether the Knights to pick from are shown, after Choose your own. */
	#browsing = false;

	/** Whether the search box beside the d6 results is open, after its magnifying glass. */
	#searchOpen = false;

	/** How far the window really widened to show them, so folding them away gives it back. */
	#widened = 0;

	/** Counts slides, so one cut short by another doesn't end the new one early. */
	#slides = 0;

	/** The Knight's name, as typed or rolled beside Apply. Starts as their own, unless Create Actor only gave them a stand-in. */
	#name = startingName(this.actor?.name, game.i18n.localize(CONFIG.Actor.typeLabels.knight));

	/** @type {[string, number][]} The hooks that draw the window again when who's taken which Knight changes. */
	#hooks = [];

	/** @type {Map<string, string>} #taken as the window was last drawn: the hooks draw it again whenever that changes. */
	#takenNow = new Map();

	/** Whether the search box is open: after its magnifying glass, or while something is searched for. */
	get #searchShown() {
		return this.#searchOpen || Boolean(this.search);
	}

	/** @override */
	get title() {
		return t("chooser.title");
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);

		const entries = this.#entries();
		const taken = this.#takenNow = this.#taken();
		const takenLabel = (roll) => (taken.has(roll) ? t("chooser.takenBy", { name: taken.get(roll) }) : null);
		const selected = entries.find((entry) => entry.roll === this.roll);

		let notice = null;
		if (!this.index) notice = t("chooser.noIndex");
		else if (!entries.some((entry) => entry.knight?.ability)) notice = t("chooser.noText");

		return Object.assign(context, {
			notice,
			starts: STARTS.map(({ key }) => ({
				key,
				label: t(`chooser.starts.${key}.label`),
				summary: t(`chooser.starts.${key}.summary`),
				active: key === this.#start
			})),
			glory: this.#gloryContext(),
			scores: SCORES.map((key) => ({
				key,
				abbr: key === "guard" ? t("guard.abbr") : t(`virtues.${key}.abbr`),
				value: this.#scores[key],
				max: key === "guard" ? null : VIRTUE_MAX
			})),
			browsing: this.#browsing,
			knighting: this.#knighting && {
				hint: t("chooser.knighted.hint", { name: this.actor.name }),
				kept: [...VIRTUES.map((key) => ({ abbr: t(`virtues.${key}.abbr`), value: this.actor.system.virtues[key].max })),
					{ abbr: t("guard.abbr"), value: this.actor.system.guard.max }]
			},
			searchOpen: this.#searchShown,
			cards: entries.map((entry) => {
				const name = this.#knightName(entry);
				return {
					roll: entry.roll,
					d12: entry.d12,
					...this._cardFields(entry, name),
					name,
					img: entry.knight?.path ?? null,
					// Said on hover, so the card carries no line saying who has it.
					takenTip: taken.has(entry.roll) ? t("chooser.takenTip", { name: taken.get(entry.roll) }) : null,
					selected: entry.roll === this.roll
				};
			}),
			selected: selected && {
				name: this.#knightName(selected),
				reference: t("chooser.reference", { roll: selected.roll, page: selected.page }),
				img: selected.knight?.path ?? null,
				takenBy: takenLabel(selected.roll),
				verse: this.#verse(selected),
				property: selected.knight?.property ?? null,
				ability: selected.knight?.ability ?? null,
				passion: selected.knight?.passion ?? null,
				seer: selected.seer?.name ? {
					name: selected.seer.name,
					img: selected.seer.path,
					// What the book says of them, without their scores.
					lines: (selected.seer.lines ?? []).filter(Boolean)
				} : null
			},
			applyLabel: this.actor ? t("chooser.apply", { name: this.actor.name }) : t("chooser.create"),
			name: this.#name,
			canApply: this.#canApply(taken)
		});
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		// Another player choosing, or a Knight falling, changes which Knights are free. Not under a name being typed.
		const redraw = () => renderWhenIdle(this);
		const onUpdate = (actor, changes) => {
			if (actor.type !== "knight") return;
			const system = changes.system ?? {};
			if ("knightType" in system || "slain" in system || "isSquire" in system || "name" in changes) redraw();
		};
		const onKnight = (actor) => actor.type === "knight" && redraw();
		this.#hooks = [["updateActor", Hooks.on("updateActor", onUpdate)],
			["createActor", Hooks.on("createActor", onKnight)],
			["deleteActor", Hooks.on("deleteActor", onKnight)]];
	}

	/** @override */
	_onClose(options) {
		for (const [hook, id] of this.#hooks) Hooks.off(hook, id);
		this.#hooks = [];
		super._onClose(options);
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		// Apply waits for a name, so it follows each keystroke rather than the form's change.
		const input = this.element.querySelector("input[name=knightName]");
		input?.addEventListener("input", () => {
			this.#name = input.value;
			this.#syncApply();
		});
		// Escape shuts the search rather than the window.
		this.element.querySelector("input[name=search]")?.addEventListener("keydown", (event) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			this.#showSearch(false);
		});
	}

	/**
	 * @returns {{lowest: number, highest: number, suggested: number}|null} The Glory a Knight made in place of one
	 *   who fell may start with, where the Company is well established (p195).
	 */
	#gloryOffer() {
		return this.#knighting ? null : replacementGlory(this.#companyGlory, startFor(this.#start).glory);
	}

	/** @returns {{value: number, hint: string}|null} The Glory box, where it's offered. */
	#gloryContext() {
		const offer = this.#gloryOffer();
		if (!offer) return null;
		const { lowest, highest, suggested } = offer;
		return {
			value: this.#glory ?? suggested,
			hint: t("chooser.glory.hint", { glory: lowest === highest ? lowest : `${lowest}–${highest}` })
		};
	}

	/**
	 * @param {Map<string, string>} [taken] From #taken; as last drawn where not given.
	 * @returns {boolean} Whether a Knight no one else is has been picked, and named.
	 */
	#canApply(taken = this.#takenNow) {
		return Boolean(this.roll && !taken.has(this.roll) && this.#name.trim());
	}

	/** Enable Apply once there's a Knight and a name, without re-rendering under the cursor. */
	#syncApply() {
		const apply = this.element?.querySelector("[data-action=apply]");
		if (apply) apply.disabled = !this.#canApply();
	}

	/**
	 * Every roll in book order, with whatever the art index knows about it.
	 * @returns {{d6: number, d12: number, roll: string, page: number, knight: object|null, seer: object|null}[]}
	 */
	#entries() {
		return spreads().map(({ d6, d12, roll, knightPage }) => ({
			d6,
			d12,
			roll,
			page: knightPage,
			knight: findByRoll(this.index?.knights, roll),
			seer: findByRoll(this.index?.seers, roll)
		}));
	}

	/**
	 * The verse under a Knight's name: from the index, or else read from the
	 * world's rulebook for an index imported before the Knights' verses were.
	 * @param {{page: number, knight: object|null}} entry From #entries.
	 * @returns {string[]|null} One entry a line, or null while it's read or where there's none.
	 */
	#verse({ page, knight }) {
		if (!knight) return null;
		// Drawn in if the window's still open.
		return peekVerseForEntry(this.index, knight, { page, versionFloor: KNIGHT_VERSE_VERSION }, (verse) => verse && this.rendered && this.render());
	}

	/** @returns {string} The Knight's name, or their roll before the book is imported. */
	#knightName(entry) {
		return entry.knight?.name ?? t("chooser.unnamed", { roll: entry.roll });
	}

	/**
	 * @returns {Map<string, string>} Rolls other living Knights already are, to who. None where the Referee
	 *   lets two characters be the same Knight.
	 */
	#taken() {
		if (allowsDuplicateKnights()) return new Map();
		return takenKnights(knightRows(), this.index?.knights ?? [], this.actor?.id);
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/**
	 * Keep scores typed by hand, without re-rendering under the cursor.
	 * @this {KnightChooser}
	 */
	static async #onChangeForm(_event, _form, formData) {
		for (const key of SCORES) {
			const value = formData.object[key];
			if (!Number.isFinite(value)) this.#scores[key] = null;
			else this.#scores[key] = key === "guard" ? Math.max(0, Math.trunc(value)) : clampVirtue(value);
		}
		// Only there where it's offered; left blank, it goes back to what's suggested.
		if ("glory" in formData.object) {
			const glory = formData.object.glory;
			this.#glory = Number.isFinite(glory) ? Math.max(0, Math.trunc(glory)) : null;
		}
	}

	/** @this {KnightChooser} */
	static #onSetStart(_event, target) {
		this.#start = startFor(target.dataset.start).key;
		return this.render();
	}

	/**
	 * Roll each Virtue in order, then GD, with the Start's dice.
	 * @this {KnightChooser}
	 */
	static async #onRollScores() {
		const start = startFor(this.#start);
		const { scores, rolls } = await rollStartScores(start);
		Object.assign(this.#scores, scores);

		await postCard(this.actor, "creation", {
			title: t("chooser.card.scores"),
			tagline: t(`chooser.starts.${start.key}.label`),
			lines: SCORES.map((key) => ({
				label: key === "guard" ? t("guard.abbr") : t(`virtues.${key}.abbr`),
				value: this.#scores[key]
			}))
		}, { rolls });
		return this.render();
	}

	/**
	 * Roll for a Knight and show the one rolled. Rolling d6 then d12 again on one
	 * another character already is lands on each free Knight as often as one die
	 * across the free Knights does, so that's what's rolled. Nothing goes to chat.
	 * @this {KnightChooser}
	 */
	static async #onRollKnight() {
		const free = this.#entries().filter((entry) => !this.#takenNow.has(entry.roll));
		if (!free.length) return ui.notifications.warn(t("chooser.allTaken"));
		const roll = await new Roll(`1d${free.length}`).evaluate();
		const entry = free[roll.total - 1];
		// The Knight rolled shows among their d6 result, whatever was searched for.
		this.search = "";
		this.group = entry.d6;
		this.roll = entry.roll;
		return this.render();
	}

	/**
	 * A Knight another character already is can't be picked, and the Referee is told why.
	 * @override
	 */
	_canPick(roll) {
		const takenBy = this.#takenNow.get(roll);
		if (takenBy) this.#warnTaken(this.#entries().find((entry) => entry.roll === roll), takenBy);
		return !takenBy;
	}

	/**
	 * Open the search box beside the d6 results, or shut it and show the d6 result again.
	 * @this {KnightChooser}
	 */
	static #onToggleSearch() {
		this.#showSearch(!this.#searchShown);
	}

	/**
	 * Open or shut the search box; shut, what was searched for is let go. Nothing is
	 * drawn again, so the box keeps its place and the Knights theirs.
	 * @param {boolean} open
	 */
	#showSearch(open) {
		this.#searchOpen = open;
		if (!open) this.search = "";
		const find = this.element.querySelector(".bastionland-knight-chooser__find");
		const box = find?.querySelector("input[name=search]");
		if (!box) return;
		const toggle = find.querySelector("[data-action=toggleSearch]");
		box.hidden = !open;
		find.classList.toggle("is-open", open);
		find.classList.toggle("is-opening", open);
		toggle?.setAttribute("aria-expanded", String(open));
		if (open) return box.focus();
		box.value = "";
		toggle?.focus();
		this._applySearch();
	}

	/**
	 * Say who already is this Knight, that no two characters may be, and that the Referee can allow it.
	 * @param {object} entry From #entries.
	 * @param {string} takenBy Who is.
	 */
	#warnTaken(entry, takenBy) {
		ui.notifications.warn(t("chooser.takenNotice", { name: takenBy, knight: midSentence(this.#knightName(entry)) }));
	}

	/**
	 * Show the Knights to pick from, or fold them away again, widening or
	 * narrowing the window to fit. The page isn't drawn again, so their column
	 * slides open or shut with the window.
	 * @this {KnightChooser}
	 */
	static #onBrowse(_event, target) {
		this.#browsing = !this.#browsing;
		target.setAttribute("aria-expanded", String(this.#browsing));
		this.element.querySelector(".bastionland-chooser__layout")?.classList.toggle("is-folded", !this.#browsing);
		if (this.#browsing) this.#widened = this.#slide(BROWSE_WIDTH);
		else this.#slide(-this.#widened);
	}

	/**
	 * Widen or narrow the window about its middle, animated unless motion is reduced.
	 * @param {number} change  Pixels to add to the width.
	 * @returns {number} The change made, which the screen's edges can cut short.
	 */
	#slide(change) {
		const element = this.element;
		const { width, left } = this.position;
		const slide = ++this.#slides;
		element.classList.add("is-sliding");
		this.setPosition({ width: width + change, left: left - change / 2 });
		// The transition goes once it ends, so dragging or resizing the window isn't slowed by it.
		Promise.allSettled(element.getAnimations().map((animation) => animation.finished)).then(() => {
			if (slide === this.#slides) element.classList.remove("is-sliding");
		});
		return this.position.width - width;
	}

	/**
	 * Put a medieval name in the box: never the one already there, nor another Knight's while any is left.
	 * @this {KnightChooser}
	 */
	static #onRollName() {
		const others = worldKnights((actor) => actor !== this.actor).map((actor) => actor.name);
		this.#name = rollKnightName(Math.random, [this.#name, ...others]);
		const input = this.element.querySelector("input[name=knightName]");
		if (input) input.value = this.#name;
		this.#syncApply();
	}

	/**
	 * Give the Knight everything chosen and rolled here, and the name beside Apply.
	 * @this {KnightChooser}
	 */
	static async #onApply() {
		const entry = this.#entries().find((candidate) => candidate.roll === this.roll);
		const name = this.#name.trim();
		if (!entry || !name) return;
		// Someone else may have become this Knight while the window was open.
		const takenBy = this.#taken().get(entry.roll);
		if (takenBy) {
			this.#warnTaken(entry, takenBy);
			return this.render();
		}
		if (this.#knighting) return this.#applyKnighted(entry, name);

		const knightName = this.#knightName(entry);
		const update = knightUpdate({
			start: startFor(this.#start),
			virtues: this.#scores,
			guard: this.#scores.guard,
			knight: entry.knight,
			seer: entry.seer
		});
		// Where they join a well-established Company, the Glory offered in place of the Start's (p195).
		const offer = this.#gloryOffer();
		if (offer) update["system.glory"] = this.#glory ?? offer.suggested;
		const kitNames = Object.fromEntries(STANDARD_KIT.map(({ key }) => [key, t(`chooser.kit.${key}`)]));
		const items = knightItems(entry.knight, kitNames, kitWeaponNames());

		const actor = this.actor;
		if (!actor) {
			const created = await createKnightWithCompanions({ name, update, items });
			created?.sheet.render({ force: true });
			return this.close();
		}

		const { escapeHTML } = foundry.utils;
		const confirmed = this.fresh || await confirmDialog({
			title: t("chooser.confirmTitle"),
			icon: "fa-solid fa-chess-knight",
			message: t("chooser.confirm", { name: escapeHTML(actor.name), knight: escapeHTML(knightName) })
		});
		if (!confirmed) return;

		// Foundry leaves the Token's name behind on a rename, so it follows here unless it was set apart.
		update.name = name;
		if (actor.prototypeToken.name === actor.name) update["prototypeToken.name"] = name;
		// Chosen now, so the empty page a Knight made blank shows gives way to the sheet.
		if (actor.getFlag(SYSTEM_ID, UNCHOSEN_FLAG)) update[`flags.${SYSTEM_ID}.${UNCHOSEN_FLAG}`] = false;

		// Every piece of gear is replaced, so the companions are all among the new items,
		// and those made from the old gear go with it.
		const replaced = actor.items.filter((item) => REPLACED_TYPES.includes(item.type)).map((item) => item.id);
		const cleared = await clearCompanions(actor);
		const { steed, gone } = await makeCompanions(items, knightOwner(actor));
		if (steed) update["system.steed"] = steed;
		else if (cleared.includes(actor.system.steed)) update["system.steed"] = "";
		await actor.update(update);
		if (replaced.length) await actor.deleteEmbeddedDocuments("Item", replaced);
		await actor.createEmbeddedDocuments("Item", items.filter((item) => !gone.has(item)));
		return this.close();
	}

	/**
	 * Make a Squire just Knighted the Knight chosen here. Only what that Knight
	 * gives is added: their Property, Ability and Passion, the kit they don't
	 * carry yet, and the Seer who knighted them. Nothing they had goes. A steed
	 * the Knight brings is the one they ride from then on, and their pony stays theirs.
	 * @param {object} entry The Knight chosen.
	 * @param {string} name
	 * @returns {Promise<void>}
	 */
	async #applyKnighted(entry, name) {
		const actor = this.actor;
		const update = knightedChoice(
			{ img: actor.img, tokenImg: actor.prototypeToken.texture.src },
			entry.knight,
			entry.seer,
			Actor.implementation.DEFAULT_ICON
		);
		update.name = name;
		if (actor.prototypeToken.name === actor.name) update["prototypeToken.name"] = name;
		update[`flags.${SYSTEM_ID}.${CHOOSING_FLAG}`] = false;

		const kitNames = Object.fromEntries(STANDARD_KIT.map(({ key }) => [key, t(`chooser.kit.${key}`)]));
		const items = itemsGained(knightItems(entry.knight, kitNames, kitWeaponNames()), actor.items.contents, Object.values(kitNames));
		const { steed, gone } = await makeCompanions(items, knightOwner(actor));
		if (steed) update["system.steed"] = steed;
		await actor.update(update);
		await actor.createEmbeddedDocuments("Item", items.filter((item) => !gone.has(item)));
		return this.close();
	}
}

/**
 * @returns {string} The Start the Company took (p6), as the Realms remember it,
 *   or the book's "if unsure" where none does.
 */
function companyStartKey() {
	const viewed = globalThis.canvas?.scene?.id;
	const realms = (game.scenes ?? [])
		.filter((scene) => scene.getFlag(SYSTEM_ID, COMPANY_START_FLAG))
		// The world's Scenes come in the order they were loaded, so they're put in the order they were made.
		.sort((a, b) => (a._stats?.createdTime ?? 0) - (b._stats?.createdTime ?? 0))
		.map((scene) => ({ start: scene.getFlag(SYSTEM_ID, COMPANY_START_FLAG), viewed: scene.id === viewed, active: scene.active }));
	return realmStart(realms) ?? DEFAULT_START;
}

/**
 * Open the chooser.
 * @param {Actor|null} [actor] The Knight to fill in. Omit to create one.
 * @param {object} [options]
 * @param {boolean} [options.fresh] The Knight was only just made with Create Actor.
 * @param {boolean} [options.knighting] The Knight is a Squire just Knighted, choosing the Knight they became.
 * @param {{lowest: number, highest: number}|null} [options.companyGlory] The Glory of the Company a Knight made in
 *   place of one who fell joins, so they may start with some (p195).
 * @param {boolean} [options.replacement] The Knight is made in place of one who fell, so opens on Wanderer (p195).
 * @returns {KnightChooser}
 */
export function openKnightChooser(actor = null, { fresh = false, knighting = false, companyGlory = null, replacement = false } = {}) {
	const chooser = new KnightChooser({ actor, fresh, knighting, companyGlory, replacement });
	chooser.render({ force: true });
	return chooser;
}
