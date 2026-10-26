import { loadOwnSkins, removeOwnSkin } from "../actions/own-skins.js";
import {
	REALM_LOOK_HOOK,
	endRealmLookPreview,
	getRealmLook,
	gridAlphaDiffers,
	isRealmScene,
	previewRealmLook,
	realmGridAlpha,
	setRealmGridAlpha,
	setRealmLook
} from "../actions/realm.js";
import { t } from "../chat/cards.js";
import { realmTextures } from "../rules/realm-documents.js";
import {
	FADED_ICONS,
	REALM_PALETTES,
	REALM_SKINS,
	normaliseRealmLook,
	ownSkinLook,
	ownSkinOf,
	paletteSwatches,
	realmSetDir,
	withOwnSkin,
	withoutOwnSkin
} from "../rules/realm-skins.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { ArtPreviewMixin } from "./art-preview.js";
import { OwnSkinMaker, realmPictureGroups } from "./OwnSkinMaker.js";
import { confirmDialog, singletonOpener } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** The pictures each skin's card shows it by. */
const SAMPLES = Object.freeze(["terrain-forest", "holding-castle", "landmark-sanctum", "myth-3"]);

/** @returns {Scene|null} The Realm Scene this GM is viewing, if any. */
const viewedRealm = () => (isRealmScene(canvas?.scene) ? canvas.scene : null);

const sameLook = (a, b) => JSON.stringify(normaliseRealmLook(a)) === JSON.stringify(normaliseRealmLook(b));

/**
 * Draw the hex lines of the Realm Scene in view at a strength on this screen alone, as the look's preview does its Tiles.
 * @param {Scene|null} scene
 * @param {number|null} alpha
 */
function showGridStrength(scene, alpha) {
	if (alpha === null || !scene || scene !== canvas?.scene) return;
	const mesh = canvas.interface?.grid?.mesh;
	if (mesh && !mesh.destroyed) mesh.initialize?.({ alpha });
}

/**
 * The GM's window for how a Realm Scene looks: a skin, shipped or made of
 * their own pictures, and a colour set, and how strongly its icons and hex lines are drawn.
 * Choices are tried out in the preview, and reach the Realm Scene being viewed when applied.
 * With no Realm Scene in view, they only change the look new Realms start with.
 */
export class RealmAppearance extends ArtPreviewMixin(HandlebarsApplicationMixin(ApplicationV2)) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-realm-appearance",
		classes: [SYSTEM_ID, "bastionland", "bastionland-realm-appearance-window"],
		tag: "div",
		position: { width: 1100, height: "auto" },
		window: { title: "bastionland.realm.look.title", icon: "fa-solid fa-palette", resizable: true },
		actions: {
			pickSkin: RealmAppearance.#onPickSkin,
			pickOwnSkin: RealmAppearance.#onPickOwnSkin,
			makeSkin: RealmAppearance.#onMakeSkin,
			editOwnSkin: RealmAppearance.#onEditOwnSkin,
			removeOwnSkin: RealmAppearance.#onRemoveOwnSkin,
			pickPalette: RealmAppearance.#onPickPalette,
			apply: RealmAppearance.#onApply
		}
	};

	static PREVIEWED_ART = ".bastionland-realm-appearance__group img";

	static PARTS = {
		appearance: { template: templatePath("apps/realm-appearance.hbs"), scrollable: [""] }
	};

	/** The Realm Scene being viewed, whose look this changes. Null for the look new Realms start with. */
	#scene = viewedRealm();

	/** The look being tried out. */
	#draft = getRealmLook(this.#scene);

	/** @type {number|null} How strongly the hex lines are drawn, being tried out; the Scene keeps it, not the look. */
	#grid = realmGridAlpha(this.#scene);

	/** @type {number|null} The hex lines' strength as the window took it up, to tell whether it's been tried at another. */
	#gridTaken = this.#grid;

	/** @type {number|null} */
	#sceneHook = null;

	/** @type {import("../rules/realm-skins.js").OwnSkin[]} The skins made of GMs' own pictures, on this server. */
	#ownSkins = [];

	/** @type {number|null} */
	#hook = null;

	/** @type {number|null} */
	#canvasHook = null;

	/**
	 * Take up the Realm Scene now in view, and what it looks like. The window is
	 * a singleton, so the Scene it was opened on last time is still remembered
	 * when it opens again, by which time the GM may be looking at another Realm.
	 */
	#takeUpViewedRealm() {
		this.#scene = viewedRealm();
		this.#draft = getRealmLook(this.#scene);
		this.#takeUpGrid();
	}

	/** Take up the hex lines' strength the Realm Scene has. */
	#takeUpGrid() {
		this.#grid = realmGridAlpha(this.#scene);
		this.#gridTaken = this.#grid;
	}

	/** @returns {{look: boolean, grid: boolean}} What's being tried out that the Scene doesn't have: another look, hex lines at another strength. */
	#changes() {
		return {
			look: !sameLook(this.#draft, getRealmLook(this.#scene)),
			grid: gridAlphaDiffers(this.#grid, realmGridAlpha(this.#scene))
		};
	}

	/** @returns {boolean} Whether there's anything to apply. */
	#changed() {
		const { look, grid } = this.#changes();
		return look || grid;
	}

	/**
	 * Show what's being tried out on the Realm Scene being viewed, for this GM only. A look's colours may draw the
	 * Scene again, which puts its hex lines back as saved, so their strength is shown once that's done.
	 */
	#preview() {
		const [scene, grid] = [this.#scene, this.#grid];
		previewRealmLook(this.#draft).then(() => showGridStrength(scene, grid));
	}

	/** @override */
	async _prepareContext(options) {
		// Before the window is drawn again from scratch, so it draws the right Realm.
		if (options.isFirstRender) {
			this.#takeUpViewedRealm();
			this.#ownSkins = await loadOwnSkins();
		}
		const context = await super._prepareContext(options);
		const draft = this.#draft;
		const textures = realmTextures(draft);
		const own = ownSkinOf(draft, this.#ownSkins);
		const inOwnPictures = Object.keys(draft.custom.files).length > 0;
		const samples = (skin, files = {}) => SAMPLES.map((name) => files[name] ?? `${realmSetDir(skin, draft.palette)}/${name}.svg`);

		return Object.assign(context, {
			skins: REALM_SKINS.map((key) => ({
				key,
				label: t(`realm.look.skins.${key}.label`),
				hint: t(`realm.look.skins.${key}.hint`),
				active: key === draft.skin && !inOwnPictures,
				samples: samples(key)
			})),
			ownSkins: this.#ownSkins.map((skin, index) => ({
				index,
				label: skin.name,
				hint: t("realm.look.own.hint", { base: t(`realm.look.skins.${skin.base}.label`) }),
				active: skin === own,
				samples: samples(skin.base, skin.files)
			})),
			// A look with pictures of a GM's own from before skins could be made of them, or from a skin since removed.
			looseOwnPictures: inOwnPictures && !own,
			palettes: REALM_PALETTES.map(({ key }) => ({
				key,
				label: t(`realm.look.palettes.${key}`),
				active: key === draft.palette,
				swatches: paletteSwatches(key)
			})),
			paper: textures.colours.paper,
			groups: realmPictureGroups(draft, textures),
			target: this.#scene ? t("realm.look.target.scene", { name: this.#scene.name }) : t("realm.look.target.none"),
			// Fading belongs to one Realm, so there's none to set for the look new Realms start with.
			fades: this.#scene ? [
				...FADED_ICONS.map((kind) => ({ key: kind, label: t(`realm.look.fade.${kind}`), value: Math.round(draft.fade[kind] * 100) })),
				{ key: "grid", label: t("realm.look.fade.grid"), value: Math.round(this.#grid * 100) }
			] : null,
			changed: this.#changed()
		});
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		// Another GM's change to this Scene's look, or one applied here, becomes what's tried out.
		this.#hook = Hooks.on(REALM_LOOK_HOOK, (sceneId) => {
			if (sceneId !== (this.#scene?.id ?? null)) return;
			this.#draft = getRealmLook(this.#scene);
			if (this.rendered) this.render();
		});
		// The window follows the GM to another Scene. Unapplied choices carry over and show there; otherwise it shows that Scene's own look.
		this.#canvasHook = Hooks.on("canvasReady", () => {
			const unchanged = sameLook(this.#draft, getRealmLook(this.#scene));
			const gridUnchanged = this.#grid === this.#gridTaken;
			this.#scene = viewedRealm();
			if (unchanged) this.#draft = getRealmLook(this.#scene);
			if (gridUnchanged || !this.#scene) this.#takeUpGrid();
			if (this.rendered) this.render();
		});
		// Hex lines set elsewhere, as while drawing the Realm, become what's tried here unless they're being tried at another strength.
		this.#sceneHook = Hooks.on("updateScene", (scene, changes) => {
			if (scene !== this.#scene || changes.grid?.alpha === undefined || this.#grid !== this.#gridTaken) return;
			this.#takeUpGrid();
			if (this.rendered) this.render();
		});
	}

	/** @override */
	_onRender(context, options) {
		super._onRender(context, options);
		this.#preview();
		this.#wireFades();
	}

	/** The sliders: the number follows the handle, and letting go tries the strength out. */
	#wireFades() {
		for (const input of this.element.querySelectorAll("input[data-fade]")) {
			const output = input.parentElement.querySelector("output");
			input.addEventListener("input", () => {
				if (output) output.value = `${input.value}%`;
			});
			input.addEventListener("change", () => this.#setFade(input.dataset.fade, Number(input.value) / 100));
		}
	}

	/**
	 * @param {string} kind One of FADED_ICONS, or "grid" for the hex lines.
	 * @param {number} alpha 0 to 1.
	 */
	#setFade(kind, alpha) {
		if (kind === "grid") this.#grid = alpha;
		else if (FADED_ICONS.includes(kind)) this.#draft = normaliseRealmLook({ ...this.#draft, fade: { ...this.#draft.fade, [kind]: alpha } });
		else return;
		// Only the preview and the Apply button change, so the window isn't drawn again, and the slider keeps the keyboard's focus.
		this.#preview();
		const apply = this.element.querySelector("[data-action='apply']");
		if (apply) apply.disabled = !this.#changed();
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		// Whatever wasn't applied is let go, and the Scenes go back to the saved look.
		this.#takeUpViewedRealm();
		const [scene, grid] = [this.#scene, this.#grid];
		endRealmLookPreview().then(() => showGridStrength(scene, grid));
		if (this.#hook !== null) Hooks.off(REALM_LOOK_HOOK, this.#hook);
		if (this.#canvasHook !== null) Hooks.off("canvasReady", this.#canvasHook);
		if (this.#sceneHook !== null) Hooks.off("updateScene", this.#sceneHook);
		this.#hook = null;
		this.#canvasHook = null;
		this.#sceneHook = null;
	}

	/** @param {Partial<import("../rules/realm-skins.js").RealmLook>} changes */
	#change(changes) {
		this.#draft = normaliseRealmLook({ ...this.#draft, ...changes });
		this.render();
	}

	/**
	 * @param {HTMLElement} target
	 * @returns {import("../rules/realm-skins.js").OwnSkin|undefined}
	 */
	#ownSkinAt(target) {
		return this.#ownSkins[Number(target.closest("[data-own-skin]")?.dataset.ownSkin)];
	}

	/**
	 * Open the window for making a skin, or changing one. Once saved, it's
	 * listed here and becomes the skin being tried out.
	 * @param {import("../rules/realm-skins.js").OwnSkin|null} skin
	 */
	#openMaker(skin = null) {
		new OwnSkinMaker({
			palette: this.#draft.palette,
			base: this.#draft.skin,
			skin,
			onSaved: (saved) => {
				// Put in the list as saved, rather than reading every skin from the server again.
				this.#ownSkins = withOwnSkin(this.#ownSkins, saved);
				this.#change(ownSkinLook(saved, this.#draft));
			}
		}).render({ force: true });
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {RealmAppearance} */
	static #onPickSkin(_event, target) {
		this.#change({ skin: target.dataset.skin, custom: { ...this.#draft.custom, folder: "", files: {} } });
	}

	/** @this {RealmAppearance} */
	static #onPickOwnSkin(_event, target) {
		const skin = this.#ownSkinAt(target);
		if (skin) this.#change(ownSkinLook(skin, this.#draft));
	}

	/** @this {RealmAppearance} */
	static #onMakeSkin() {
		this.#openMaker();
	}

	/** @this {RealmAppearance} */
	static #onEditOwnSkin(_event, target) {
		const skin = this.#ownSkinAt(target);
		if (skin) this.#openMaker(skin);
	}

	/**
	 * Take a skin off the list in every world. Realms drawn with it keep their pictures.
	 * @this {RealmAppearance}
	 */
	static async #onRemoveOwnSkin(_event, target) {
		const skin = this.#ownSkinAt(target);
		if (!skin) return;
		const name = foundry.utils.escapeHTML(skin.name);
		const confirmed = await confirmDialog({
			title: t("realm.look.own.removeTitle"),
			icon: "fa-solid fa-trash",
			message: t("realm.look.own.removeConfirm", { name })
		});
		if (!confirmed) return;
		if (!await removeOwnSkin(skin)) {
			ui.notifications.error(t("realm.look.own.removeFailed", { name: skin.name }));
			return;
		}
		this.#ownSkins = withoutOwnSkin(this.#ownSkins, skin);
		this.render();
	}

	/** @this {RealmAppearance} */
	static #onPickPalette(_event, target) {
		this.#change({ palette: target.dataset.palette });
	}

	/** @this {RealmAppearance} */
	static async #onApply() {
		const scene = this.#scene;
		const { look: lookChanged, grid: gridChanged } = this.#changes();
		if (!lookChanged && !gridChanged) return;
		// The preview only changed this browser's copy, which would make the saved Scene look up to date already.
		await endRealmLookPreview({ redraw: false });
		// A new look carries the hex lines' strength in its own write of the Scene.
		if (lookChanged) await setRealmLook(scene, this.#draft, { gridAlpha: this.#grid });
		else await setRealmGridAlpha(scene, this.#grid);
		ui.notifications.info(scene ? t("realm.look.applied", { name: scene.name }) : t("realm.look.appliedDefault"));
		await this.close();
	}
}

const openAppearance = singletonOpener(RealmAppearance);

/** @returns {RealmAppearance|null} */
export const openRealmAppearance = () => (game.user.isGM ? openAppearance() : null);

/** Put Realm Appearance among the system's settings, for GMs. Called during init. */
export function registerRealmAppearanceMenu() {
	game.settings.registerMenu(SYSTEM_ID, "realmAppearance", {
		name: "bastionland.realm.look.title",
		label: "bastionland.realm.look.open",
		hint: "bastionland.realm.look.hint",
		icon: "fa-solid fa-palette",
		type: RealmAppearance,
		restricted: true
	});
}
