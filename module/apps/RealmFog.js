import { liftAllRealmFog, realmFogOptions, setRealmFogOptions, veilAllRealmFog } from "../actions/realm-fog.js";
import { isRealmScene } from "../actions/realm.js";
import { t } from "../chat/cards.js";
import { escapeHTML } from "../rules/text.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { confirmDialog, singletonOpener } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The Fog of War of the Realm on the canvas: whether it's on, whether its
 * Holdings show through, the whole of it lifted or brought back, and the
 * brush that does either a hex at a time. Each change is written as it's
 * made, so there's nothing to save, and an open window follows the Realm's
 * fog as it changes, here or on another Referee's client. Opened from the
 * Realm's scene controls. Referees only.
 */
export class RealmFog extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-realm-fog",
		classes: [SYSTEM_ID, "bastionland", "bastionland-dialog", "bastionland-realm-fog-window"],
		position: { width: 440, height: "auto" },
		window: { title: "bastionland.realmFog.title", icon: "fa-solid fa-smog", resizable: true },
		actions: {
			liftAll: RealmFog.#onLiftAll,
			veilAll: RealmFog.#onVeilAll,
			brush: RealmFog.#onBrush
		}
	};

	static PARTS = {
		fog: { template: templatePath("apps/realm-fog.hbs") }
	};

	/** @returns {Scene|null} The Realm on the canvas, which is the one the window works on. */
	static get scene() {
		const scene = globalThis.canvas?.scene ?? null;
		return isRealmScene(scene) ? scene : null;
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const scene = RealmFog.scene;
		const { on, holdings } = realmFogOptions(scene);
		// What lifts, brings back or brushes the fog, and whether Holdings show through it, change only while it's on.
		return Object.assign(context, { on, holdings, locked: !on, realm: scene?.name ?? "", none: !scene });
	}

	/** @override */
	_onRender(context, options) {
		super._onRender(context, options);
		this.element.querySelector(".bastionland-realm-fog")?.addEventListener("change", (event) => {
			const input = event.target;
			if (input.name === "on" || input.name === "holdings") setRealmFogOptions(RealmFog.scene, { [input.name]: input.checked });
		});
	}

	/**
	 * Do something to the whole Realm's fog, once the Referee says so.
	 * @param {"liftAll"|"veilAll"} key Its button's label, and with "Ask" its question.
	 * @param {string} icon
	 * @param {(scene: Scene) => Promise<boolean>} act
	 */
	static async #whole(key, icon, act) {
		const scene = RealmFog.scene;
		if (!scene) return;
		const sure = await confirmDialog({ title: t(`realmFog.${key}`), icon, message: t(`realmFog.${key}Ask`, { realm: escapeHTML(scene.name) }) });
		if (sure) await act(scene);
	}

	/** Lift the fog from every hex, once the Referee says so. */
	static #onLiftAll() {
		return RealmFog.#whole("liftAll", "fa-solid fa-sun", liftAllRealmFog);
	}

	/** Bring the fog back over every hex, once the Referee says so. */
	static #onVeilAll() {
		return RealmFog.#whole("veilAll", "fa-solid fa-cloud", veilAllRealmFog);
	}

	/** Pick up the brush that lifts the fog, or brings it back, a hex at a time. */
	static async #onBrush() {
		await globalThis.canvas?.realm?.useTool("fog");
	}
}

/** @returns {RealmFog} */
export const openRealmFog = singletonOpener(RealmFog);

/**
 * Draw an open window again after a Realm's fog changed, or the canvas moved on to another Scene.
 * @param {string} [sceneId] The Realm whose fog changed; any, if not given.
 */
export function refreshRealmFog(sceneId) {
	const app = foundry.applications.instances?.get(RealmFog.DEFAULT_OPTIONS.id);
	if (!app?.rendered) return;
	if (sceneId && sceneId !== globalThis.canvas?.scene?.id) return;
	app.render();
}
