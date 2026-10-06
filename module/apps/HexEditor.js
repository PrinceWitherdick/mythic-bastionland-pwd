import { hexLabel } from "../actions/hex-names.js";
import { getRealm, sceneGeometry, stepRealmHistory } from "../actions/realm.js";
import { realmKnown } from "../actions/solo.js";
import { loadArtIndex } from "../book-art/art-index.js";
import { t } from "../chat/cards.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { HEX_FEATURE_ACTIONS, chooseHexMyth, hexEditContext, rollHexMyth, writeHexEditField } from "./hex-edit.js";
import { renderWhenIdle } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Edit this hex, in a window of its own: opened from the pen beside a hex's
 * terrain in Places, it changes the hex itself. Each field is written as it
 * changes, and the window is drawn again from the Realm, so it never shows the
 * hex differently from the map. One window, moved to whichever hex was last opened.
 */
export class HexEditor extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-hex-editor",
		classes: [SYSTEM_ID, "bastionland", "bastionland-hex-editor-window"],
		position: { width: 420, height: "auto" },
		window: { icon: "fa-solid fa-pen-to-square", resizable: true },
		actions: {
			rollMyth: HexEditor.#at((scene, hex) => rollHexMyth(scene, hex)),
			chooseMyth: HexEditor.#at((scene, hex) => chooseHexMyth(scene, hex)),
			// Roll the Seer, step the Omens, reveal: as in the Lay of the Land.
			...Object.fromEntries(Object.entries(HEX_FEATURE_ACTIONS).map(([name, act]) => [name, HexEditor.#at((scene, hex, target) => act({ scene, hex }, target))])),
			undo: HexEditor.#at((scene) => stepRealmHistory(scene, "undo")),
			redo: HexEditor.#at((scene) => stepRealmHistory(scene, "redo"))
		}
	};

	static PARTS = {
		body: { template: templatePath("apps/parts/hex-edit.hbs") }
	};

	/**
	 * A button of the window, handed the hex it shows.
	 * @param {(scene: Scene, hex: {col: number, row: number}, target: HTMLElement) => unknown} act
	 * @returns {(event: Event, target: HTMLElement) => unknown}
	 */
	static #at(act) {
		return function (_event, target) {
			const scene = this.scene;
			if (scene && this.hex && game.user.isGM) return act(scene, this.hex, target);
		};
	}

	/** @type {string|null} The Realm Scene the hex is in. */
	sceneId = null;

	/** @type {{col: number, row: number}|null} */
	hex = null;

	/** @type {object|null|undefined} The art index, read once: it names the Myth and Seer in the hex. */
	#index;

	/** @returns {Scene|null} */
	get scene() {
		return game.scenes?.get(this.sceneId) ?? null;
	}

	/** @override */
	get title() {
		const scene = this.scene;
		return scene && this.hex ? t("hexEdit.title", { hex: hexLabel(this.hex, scene) }) : t("hexLore.edit");
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const scene = this.scene;
		const entry = scene ? getRealm(scene) : null;
		if (this.#index === undefined) this.#index = await loadArtIndex();
		const edit = entry && this.hex ? hexEditContext({
			scene,
			realm: entry.realm,
			// Played alone, only what the Company has found here.
			known: realmKnown(entry.realm),
			g: sceneGeometry(scene),
			hex: this.hex,
			index: this.#index
		}) : null;
		return Object.assign(context, edit ?? {}, { gone: !edit, partId: `${this.id}-body` });
	}

	/**
	 * The title names the hex, which may have been named since the window opened.
	 * @override
	 */
	_configureRenderOptions(options) {
		super._configureRenderOptions(options);
		if (this.hasFrame) options.window = Object.assign(options.window ?? {}, { title: this.title });
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		// The Realm, or its Scene, went while the window was open.
		if (context.gone) return this.close();
		this.element.querySelector(".bastionland-hex-edit")?.addEventListener("change", async (event) => {
			const field = event.target;
			const scene = this.scene;
			if (!field?.name || !scene || !this.hex) return;
			event.stopPropagation();
			const written = await writeHexEditField(scene, this.hex, field);
			// What stands here didn't change, as when the GM shuts the list of Myths to move: the select shows the hex as it is.
			if (field.name === "kind" && !written) field.value = field.querySelector("option[selected]")?.value ?? "none";
		});
	}
}

/** @type {HexEditor|null} */
let editor = null;

/**
 * Open Edit this hex on a hex, or move the open window to it. GMs only.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 * @returns {Promise<HexEditor|null>}
 */
export async function openHexEditor({ scene, hex }) {
	if (!game.user?.isGM || !scene || !hex) return null;
	editor ??= foundry.applications.instances.get(HexEditor.DEFAULT_OPTIONS.id) ?? new HexEditor();
	editor.sceneId = scene.id;
	editor.hex = { col: hex.col, row: hex.row };
	await editor.render({ force: true });
	editor.bringToFront();
	return editor;
}

/**
 * Draw the window again after its Realm changed, once the GM has finished typing.
 * @param {string} sceneId
 */
export function refreshHexEditor(sceneId) {
	if (editor?.rendered && editor.sceneId === sceneId) renderWhenIdle(editor);
}
