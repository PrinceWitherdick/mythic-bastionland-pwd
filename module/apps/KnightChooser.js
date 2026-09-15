import { findByRoll } from "../book-art/art-index.js";
import { postCard, t } from "../chat/cards.js";
import { PROPERTY_TYPES } from "../config.js";
import { spreads } from "../rules/book-art.js";
import {
	DEFAULT_START,
	STANDARD_KIT,
	STARTS,
	knightItems,
	knightUpdate,
	startFor,
	takenKnights
} from "../rules/creation.js";
import { VIRTUES, VIRTUE_MAX, clampVirtue } from "../rules/virtues.js";
import { templatePath } from "../system-id.js";
import { BastionlandChooser } from "./BastionlandChooser.js";
import { addDirectoryButton, confirmDialog } from "./ui.js";

/** Items a chosen Knight's Property, Ability and Passion replace. Scars stay. */
const REPLACED_TYPES = Object.freeze([...PROPERTY_TYPES, "ability", "passion"]);

/** Scores the chooser rolls, in the order the book rolls them. */
const SCORES = Object.freeze([...VIRTUES, "guard"]);

/**
 * Makes a Knight the way the book does (p6-7, p26): choose a Start, roll
 * Virtues and GD, then roll d6 and d12 for the Knight or pick one. It fills in
 * an existing Knight, or creates a new one.
 */
export class KnightChooser extends BastionlandChooser {
	static DEFAULT_OPTIONS = {
		tag: "form",
		position: { width: 1200, height: 860 },
		window: { icon: "fa-solid fa-chess-knight" },
		form: { handler: KnightChooser.#onChangeForm, submitOnChange: true, closeOnSubmit: false },
		actions: {
			setStart: KnightChooser.#onSetStart,
			rollScores: KnightChooser.#onRollScores,
			rollKnight: KnightChooser.#onRollKnight,
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

	/** @type {Record<string, number|null>} */
	#scores = Object.fromEntries(SCORES.map((key) => [key, null]));

	/** @override */
	get title() {
		return this.actor ? t("chooser.titleFor", { name: this.actor.name }) : t("chooser.title");
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
				seer: selected.seer?.name ? { name: selected.seer.name, img: selected.seer.path } : null
			},
			applyLabel: this.actor ? t("chooser.apply", { name: this.actor.name }) : t("chooser.create")
		});
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
	 * Roll d6 then d12 and show the Knight they land on.
	 * @this {KnightChooser}
	 */
	static async #onRollKnight() {
		const d6 = await new Roll("1d6").evaluate();
		const d12 = await new Roll("1d12").evaluate();
		const entry = this.#entries().find((candidate) => candidate.d6 === d6.total && candidate.d12 === d12.total);
		this.group = entry.d6;
		this.roll = entry.roll;

		const takenBy = this.#taken().get(entry.roll);
		await postCard(this.actor, "creation", {
			title: this.#knightName(entry),
			tagline: t("chooser.card.knightRoll", { d6: d6.total, d12: d12.total }),
			note: entry.seer?.name ? t("chooser.card.knightedBy", { seer: entry.seer.name }) : null,
			warning: takenBy ? t("chooser.takenBy", { name: takenBy }) : null
		}, { rolls: [d6, d12] });
		return this.render();
	}

	/**
	 * Give the Knight everything chosen and rolled here.
	 * @this {KnightChooser}
	 */
	static async #onApply() {
		const entry = this.#entries().find((candidate) => candidate.roll === this.roll);
		if (!entry) return;

		const name = this.#knightName(entry);
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
			const created = await Actor.implementation.create({ name, type: "knight", ...foundry.utils.expandObject(update), items });
			created?.sheet.render({ force: true });
			return this.close();
		}

		const { escapeHTML } = foundry.utils;
		const confirmed = await confirmDialog({
			title: t("chooser.confirmTitle"),
			icon: "fa-solid fa-chess-knight",
			message: t("chooser.confirm", { name: escapeHTML(actor.name), knight: escapeHTML(name) })
		});
		if (!confirmed) return;

		const replaced = actor.items.filter((item) => REPLACED_TYPES.includes(item.type)).map((item) => item.id);
		await actor.update(update);
		if (replaced.length) await actor.deleteEmbeddedDocuments("Item", replaced);
		await actor.createEmbeddedDocuments("Item", items);
		return this.close();
	}
}

/**
 * Open the chooser.
 * @param {Actor|null} [actor] The Knight to fill in. Omit to create one.
 * @returns {KnightChooser}
 */
export function openKnightChooser(actor = null) {
	const chooser = new KnightChooser({ actor });
	chooser.render({ force: true });
	return chooser;
}

/**
 * Add a New Knight button beside Create Actor, for users allowed to create actors.
 * @param {HTMLElement} element The Actors directory.
 */
export function addNewKnightButton(element) {
	if (!game.user.can("ACTOR_CREATE")) return;
	addDirectoryButton(element, {
		className: "bastionland-new-knight",
		icon: "fa-solid fa-chess-knight",
		label: t("chooser.newKnight"),
		onClick: () => openKnightChooser()
	});
}
