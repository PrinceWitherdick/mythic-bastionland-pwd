import { clearCompanions, knightOwner, makeCompanions, markCompanions } from "../actions/property.js";
import { findByRoll } from "../book-art/art-index.js";
import { postCard, t } from "../chat/cards.js";
import { PROPERTY_TYPES } from "../config.js";
import { spreads } from "../rules/book-art.js";
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
import { UNCHOSEN_FLAG } from "../rules/unchosen-knight.js";
import { SCORES, VIRTUES, VIRTUE_MAX, clampVirtue } from "../rules/virtues.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { BastionlandChooser } from "./BastionlandChooser.js";
import { confirmDialog } from "./ui.js";

/** Items a chosen Knight's Property, Ability and Passion replace. Scars stay. */
const REPLACED_TYPES = Object.freeze([...PROPERTY_TYPES, "ability", "passion"]);

/**
 * How many pixels wider the window grows to show the Knights to pick from. From
 * the starting width, the chosen Knight's column keeps its width as they slide in.
 */
const BROWSE_WIDTH = 390;

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
	 */
	constructor({ knighting = false, ...options } = {}) {
		super(options);
		this.#knighting = Boolean(this.actor && knighting);
		// A Squire still named for the Knight they served starts without one, as a Knight made blank does.
		if (this.#knighting && isSquireName(this.#name, t("squire.name"))) this.#name = "";
	}

	static DEFAULT_OPTIONS = {
		tag: "form",
		position: { width: 822, height: 1000 },
		window: { icon: "fa-solid fa-chess-knight" },
		form: { handler: KnightChooser.#onChangeForm, submitOnChange: true, closeOnSubmit: false },
		actions: {
			setStart: KnightChooser.#onSetStart,
			rollScores: KnightChooser.#onRollScores,
			rollKnight: KnightChooser.#onRollKnight,
			rollName: KnightChooser.#onRollName,
			browse: KnightChooser.#onBrowse,
			apply: KnightChooser.#onApply
		}
	};

	static PARTS = {
		chooser: {
			template: templatePath("apps/knight-chooser.hbs"),
			scrollable: [".bastionland-chooser__grid", ".bastionland-chooser__detail"]
		}
	};

	#start = DEFAULT_START;

	/** Whether this is a Squire just Knighted, choosing the Knight they became. */
	#knighting = false;

	/** @type {Record<string, number|null>} */
	#scores = Object.fromEntries(SCORES.map((key) => [key, null]));

	/** Whether the Knights to pick from are shown, after Choose your own. */
	#browsing = false;

	/** How far the window really widened to show them, so folding them away gives it back. */
	#widened = 0;

	/** Counts slides, so one cut short by another doesn't end the new one early. */
	#slides = 0;

	/** The Knight's name, as typed or rolled beside Apply. Starts as their own, unless Create Actor only gave them a stand-in. */
	#name = startingName(this.actor?.name, game.i18n.localize(CONFIG.Actor.typeLabels.knight));

	/** @override */
	get title() {
		return t("chooser.title");
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);

		const entries = this.#entries();
		const taken = this.#taken();
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
			cards: entries.filter((entry) => entry.d6 === this.group).map((entry) => ({
				roll: entry.roll,
				d12: entry.d12,
				name: this.#knightName(entry),
				img: entry.knight?.path ?? null,
				takenBy: takenLabel(entry.roll),
				selected: entry.roll === this.roll
			})),
			selected: selected && {
				name: this.#knightName(selected),
				reference: t("chooser.reference", { roll: selected.roll, page: selected.page }),
				img: selected.knight?.path ?? null,
				takenBy: takenLabel(selected.roll),
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
			canApply: this.#canApply()
		});
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
	}

	/** @returns {boolean} Whether a Knight is picked and named. */
	#canApply() {
		return Boolean(this.roll && this.#name.trim());
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

	/** @returns {string} The Knight's name, or their roll before the book is imported. */
	#knightName(entry) {
		return entry.knight?.name ?? t("chooser.unnamed", { roll: entry.roll });
	}

	/** @returns {Map<string, string>} Rolls other characters already are, to who. */
	#taken() {
		const knights = game.actors
			.filter((actor) => actor.type === "knight")
			.map((actor) => ({ id: actor.id, name: actor.name, knightType: actor.system.knightType }));
		return takenKnights(knights, this.index?.knights ?? [], this.actor?.id);
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
		const rolls = [];
		for (const key of SCORES) {
			const roll = await new Roll(key === "guard" ? start.guard : start.virtues).evaluate();
			rolls.push(roll);
			this.#scores[key] = key === "guard" ? roll.total : clampVirtue(roll.total);
		}

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
	 * Roll d6 then d12 and show the Knight they land on. Nothing goes to chat.
	 * @this {KnightChooser}
	 */
	static async #onRollKnight() {
		const d6 = await new Roll("1d6").evaluate();
		const d12 = await new Roll("1d12").evaluate();
		const entry = this.#entries().find((candidate) => candidate.d6 === d6.total && candidate.d12 === d12.total);
		this.group = entry.d6;
		this.roll = entry.roll;
		return this.render();
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
		const others = game.actors.filter((actor) => actor.type === "knight" && actor !== this.actor).map((actor) => actor.name);
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
		if (this.#knighting) return this.#applyKnighted(entry, name);

		const knightName = this.#knightName(entry);
		const update = knightUpdate({
			start: startFor(this.#start),
			virtues: this.#scores,
			guard: this.#scores.guard,
			knight: entry.knight,
			seer: entry.seer
		});
		const kitNames = Object.fromEntries(STANDARD_KIT.map(({ key }) => [key, t(`chooser.kit.${key}`)]));
		const items = knightItems(entry.knight, kitNames);

		const actor = this.actor;
		if (!actor) {
			// The steed and other companions are made first, so the Knight is made riding it in one go.
			const { made, steed, gone } = await makeCompanions(items);
			if (steed) update["system.steed"] = steed;
			const kept = items.filter((item) => !gone.has(item));
			const created = await Actor.implementation.create({ name, type: "knight", ...foundry.utils.expandObject(update), items: kept });
			if (created) await markCompanions(made, created);
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
		const items = itemsGained(knightItems(entry.knight, kitNames), actor.items.contents, Object.values(kitNames));
		const { steed, gone } = await makeCompanions(items, knightOwner(actor));
		if (steed) update["system.steed"] = steed;
		await actor.update(update);
		await actor.createEmbeddedDocuments("Item", items.filter((item) => !gone.has(item)));
		return this.close();
	}
}

/**
 * Open the chooser.
 * @param {Actor|null} [actor] The Knight to fill in. Omit to create one.
 * @param {object} [options]
 * @param {boolean} [options.fresh] The Knight was only just made with Create Actor.
 * @param {boolean} [options.knighting] The Knight is a Squire just Knighted, choosing the Knight they became.
 * @returns {KnightChooser}
 */
export function openKnightChooser(actor = null, { fresh = false, knighting = false } = {}) {
	const chooser = new KnightChooser({ actor, fresh, knighting });
	chooser.render({ force: true });
	return chooser;
}
