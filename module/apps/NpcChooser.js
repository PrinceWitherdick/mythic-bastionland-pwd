import { applyNpcData, npcData } from "../actions/npc.js";
import { findByRoll } from "../book-art/art-index.js";
import { t } from "../chat/cards.js";
import { NPC_SOURCES } from "../config.js";
import { INDEX_VERSION, spreads } from "../rules/book-art.js";
import { VIRTUES } from "../rules/virtues.js";
import { templatePath } from "../system-id.js";
import { BastionlandChooser } from "./BastionlandChooser.js";
import { addDirectoryButton, confirmDialog } from "./ui.js";

/**
 * A stat line the way the book prints one, such as "VIG 12, CLA 9, SPI 14, 5GD".
 * @param {object|null} stats
 * @returns {string|null}
 */
function statLine(stats) {
	if (!stats) return null;
	const virtues = VIRTUES.filter((key) => Number.isInteger(stats[key])).map((key) => `${t(`virtues.${key}.abbr`)} ${stats[key]}`);
	return [...virtues, `${stats.guard}${t("guard.abbr")}`].join(", ");
}

/**
 * Makes NPCs from the text Import Book Art read from the GM's own rulebook: a
 * member of a Myth's Cast, or a Seer. It fills in an existing NPC, or creates
 * new ones, staying open so a whole Cast can be made at once.
 */
export class NpcChooser extends BastionlandChooser {
	static DEFAULT_OPTIONS = {
		position: { width: 1100, height: 820 },
		window: { icon: "fa-solid fa-book-open" },
		actions: {
			showSource: NpcChooser.#onShowSource,
			create: NpcChooser.#onCreate
		}
	};

	static PARTS = {
		chooser: {
			template: templatePath("apps/npc-chooser.hbs"),
			scrollable: [".bastionland-chooser__grid", ".bastionland-chooser__detail"]
		}
	};

	#source = NPC_SOURCES[0];

	/** @override */
	get title() {
		return this.actor ? t("npcChooser.titleFor", { name: this.actor.name }) : t("npcChooser.title");
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);

		const rows = this.#rows();
		const selected = rows.find((row) => row.roll === this.roll);

		let notice = null;
		if (!this.index) notice = t("npcChooser.noIndex");
		else if ((this.index.version ?? 0) < INDEX_VERSION) notice = t("npcChooser.noText");

		return Object.assign(context, {
			notice,
			sources: NPC_SOURCES.map((key) => ({ key, label: t(`npcChooser.sources.${key}`), active: key === this.#source })),
			cards: rows.filter((row) => row.d6 === this.group).map((row) => ({
				roll: row.roll,
				d12: row.d12,
				name: row.name,
				img: row.entry?.path ?? null,
				selected: row.roll === this.roll
			})),
			selected: selected && {
				name: selected.name,
				reference: t("npcChooser.reference", { roll: selected.roll, page: selected.page }),
				img: selected.entry?.path ?? null,
				omens: selected.entry?.omens ?? [],
				castNote: selected.entry?.castNote || null,
				people: this.#people(selected).map((person, index) => ({
					index,
					name: person.name,
					statLine: statLine(person.stats),
					lines: person.lines ?? []
				}))
			},
			createLabel: this.actor ? t("npcChooser.apply", { name: this.actor.name }) : t("npcChooser.create")
		});
	}

	/**
	 * Every roll in book order, with whatever the art index knows about it.
	 * @returns {{d6: number, d12: number, roll: string, page: number, name: string, entry: object|null}[]}
	 */
	#rows() {
		const seers = this.#source === "seers";
		return spreads().map(({ d6, d12, roll, knightPage, mythPage }) => {
			const entry = findByRoll(this.index?.[this.#source], roll);
			return {
				d6,
				d12,
				roll,
				page: seers ? knightPage : mythPage,
				name: entry?.name ?? t(`npcChooser.unnamed.${this.#source}`, { roll }),
				entry
			};
		});
	}

	/**
	 * The stat blocks a row offers: a Myth's Cast, or the Seer themselves.
	 * @returns {{name: string, stats: object|null, lines: string[]}[]}
	 */
	#people({ name, entry }) {
		if (!entry) return [];
		if (this.#source === "myths") return entry.cast ?? [];
		return entry.stats || entry.lines?.length ? [{ name, stats: entry.stats, lines: entry.lines ?? [] }] : [];
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {NpcChooser} */
	static #onShowSource(_event, target) {
		const { source } = target.dataset;
		if (!NPC_SOURCES.includes(source) || source === this.#source) return;
		this.#source = source;
		this.roll = null;
		return this.render();
	}

	/**
	 * Make an NPC from one stat block, or give it to the NPC being filled in.
	 * @this {NpcChooser}
	 */
	static async #onCreate(_event, target) {
		const row = this.#rows().find((candidate) => candidate.roll === this.roll);
		const person = row && this.#people(row)[Number(target.dataset.index)];
		if (!person) return;

		const data = npcData(person);
		const name = data.name || row.name;
		const art = row.entry?.path ? { img: row.entry.path } : {};

		const actor = this.actor;
		if (!actor) {
			const created = await Actor.implementation.create({ name, type: "npc", ...art, system: data.system, items: data.items });
			if (created) ui.notifications.info(t("npcChooser.created", { name: created.name }));
			return;
		}

		const { escapeHTML } = foundry.utils;
		const confirmed = await confirmDialog({
			title: t("npcChooser.confirmTitle"),
			icon: "fa-solid fa-book-open",
			message: t("npcChooser.confirm", { name: escapeHTML(actor.name), npc: escapeHTML(name) })
		});
		if (!confirmed) return;

		await applyNpcData(actor, { ...data, name }, art);
		return this.close();
	}
}

/**
 * Open the chooser.
 * @param {Actor|null} [actor] The NPC to fill in. Omit to create NPCs.
 * @returns {NpcChooser}
 */
export function openNpcChooser(actor = null) {
	const chooser = new NpcChooser({ actor });
	chooser.render({ force: true });
	return chooser;
}

/**
 * Add a New NPC button beside Create Actor, for users allowed to create actors.
 * @param {HTMLElement} element The Actors directory.
 */
export function addNewNpcButton(element) {
	if (!game.user.can("ACTOR_CREATE")) return;
	addDirectoryButton(element, {
		className: "bastionland-new-npc",
		icon: "fa-solid fa-book-open",
		label: t("npcChooser.newNpc"),
		onClick: () => openNpcChooser()
	});
}
