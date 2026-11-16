import { droppedScene, linkOmenScene, omenSceneChips, unlinkOmenScene, viewOmenScene } from "../actions/omen-scenes.js";
import { OWN_MYTH_FLAG, isUntouchedOwnMyth, ownMythWrites, readOwnMyth } from "../actions/own-myths.js";
import { getRealm, isRealmScene } from "../actions/realm.js";
import { t } from "../chat/cards.js";
import { VERSE_LINES, mythWithOwn, normaliseOwnMyth, ownMythChanged, tableWritten } from "../rules/own-myths.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { OwnEntrySheet } from "./OwnEntrySheet.js";

/**
 * @param {string} id A written Myth's entry.
 * @returns {boolean} Whether any Realm of the world holds it among its six.
 */
const heldByARealm = (id) => game.scenes.some((scene) => isRealmScene(scene) && Boolean(mythWithOwn(getRealm(scene)?.realm.myths ?? [], id)));

/**
 * A Myth the Referee writes for themselves, as its Journal entry opens: what
 * a Myth's page in the book has, to be filled in. It stands among a Realm's
 * six once it's chosen in The Realm's Myths, and the GM Toolkit, the Omen
 * cards and the picture's window read it there as they read the book's.
 */
// The table's fold is kept as it was left across each save's redraw (OwnEntrySheet).
export class OwnMythSheet extends OwnEntrySheet {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-own-myth-window"],
		position: { width: 620, height: 760 },
		window: { icon: "fa-solid fa-dragon", resizable: true },
		form: { handler: OwnMythSheet.#onSubmit },
		actions: {
			viewOmenScene: OwnMythSheet.#onViewScene,
			unlinkOmenScene: OwnMythSheet.#onUnlinkScene
		}
	};

	static PARTS = {
		myth: { template: templatePath("apps/own-myth.hbs"), scrollable: [""] }
	};

	/**
	 * Each change waits for the one before (ownMythWrites), so it works from the
	 * Myth as that one left it, a Scene linked from the GM Toolkit among them.
	 * One made with New Myth and closed untouched is deleted, unless a Realm took
	 * it in the meantime.
	 * @type {import("./OwnEntrySheet.js").OwnEntryKind}
	 */
	static KIND = {
		noun: "Myth",
		flag: OWN_MYTH_FLAG,
		read: readOwnMyth,
		normalise: normaliseOwnMyth,
		changed: ownMythChanged,
		writes: ownMythWrites,
		discardable: (entry) => isUntouchedOwnMyth(entry) && !heldByARealm(entry.id),
		pictures: { img: { get: (myth) => myth.img, set: (myth, path) => ({ ...myth, img: path }) } }
	};

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const myth = readOwnMyth(this.document);
		const field = (name, index) => `${name}.${index}`;
		return Object.assign(context, {
			rootId: this.id,
			editable: this.isEditable,
			name: this.document.name,
			img: myth.img || null,
			verse: myth.verse.map((line, index) => ({
				name: field("verse", index),
				value: line,
				label: t("ownMyth.verseLine", { number: index + 1, count: VERSE_LINES })
			})),
			omens: myth.omens.map((omen, index) => ({
				number: index + 1,
				name: field("omens", index),
				value: omen,
				label: t("myths.omenNumber", { number: index + 1 }),
				scenes: omenSceneChips(myth.scenes[index])
			})),
			table: {
				// Folded away until there's something in it, as most Myths can do without one.
				open: tableWritten(myth),
				name: myth.table.name,
				columns: myth.table.columns.map((heading, index) => ({
					name: `table.columns.${index}`,
					value: heading,
					label: t("ownMyth.column", { number: index + 1 })
				})),
				rows: myth.table.rows.map((row, index) => ({
					number: index + 1,
					entries: row.map((entry, column) => ({
						name: `table.rows.${index}.${column}`,
						value: entry,
						label: t("ownMyth.cell", { row: index + 1, column: myth.table.columns[column] || t("ownMyth.column", { number: column + 1 }) })
					}))
				}))
			},
			castNote: myth.castNote
		});
	}

	/**
	 * Each Omen takes a Scene dragged onto it from the Scenes sidebar.
	 * @override
	 */
	async _onRender(context, options) {
		await super._onRender(context, options);
		if (!this.isEditable) return;
		for (const omen of this.element.querySelectorAll("[data-omen-drop]")) {
			omen.addEventListener("dragover", (event) => event.preventDefault());
			omen.addEventListener("drop", (event) => this.#onDropScene(event));
		}
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/**
	 * Name, verse, Omens, table and the word on the Cast, as typed. The picture is chosen apart from the form.
	 * @this {OwnMythSheet}
	 */
	static #onSubmit(_event, _form, formData) {
		if (!this.isEditable) return;
		const data = foundry.utils.expandObject(formData.object);
		const name = String(data.name ?? "").trim();
		const update = name && name !== this.document.name ? { name } : {};
		// What isn't a field of the form, such as the picture and the linked Scenes, is kept as it is.
		return this._writeOwn((myth) => ({ ...myth, ...data }), update);
	}

	/**
	 * Show a linked Scene to the Referee alone, to see what's set there.
	 * @this {OwnMythSheet}
	 */
	static #onViewScene(_event, target) {
		return viewOmenScene(target.closest("[data-scene-id]")?.dataset.sceneId);
	}

	/**
	 * Take a Scene off the Omen it's linked to.
	 * @this {OwnMythSheet}
	 */
	static #onUnlinkScene(_event, target) {
		if (!this.isEditable) return;
		const id = target.closest("[data-scene-id]")?.dataset.sceneId;
		const omen = Number(target.closest("[data-omen]")?.dataset.omen);
		return this.#editScenes((myth) => unlinkOmenScene(null, myth, omen, id));
	}

	/**
	 * A Scene dragged from the Scenes sidebar onto an Omen is linked to it.
	 * @param {DragEvent} event
	 */
	async #onDropScene(event) {
		const omen = Number(event.currentTarget.dataset.omen);
		const scene = await droppedScene(event);
		if (!scene || !this.isEditable) return;
		return this.#editScenes((myth) => linkOmenScene(null, myth, omen, scene));
	}

	/**
	 * Link or unlink a Scene the way the GM Toolkit does, which takes its turn
	 * with the form's saves.
	 * @param {(myth: {own: string}) => Promise<boolean>} edit
	 * @returns {Promise<void>}
	 */
	#editScenes(edit) {
		return edit({ own: this.document.id })
			.catch((error) => console.error(`${SYSTEM_ID} | Couldn't write the Myth ${this.document.name}`, error));
	}
}
