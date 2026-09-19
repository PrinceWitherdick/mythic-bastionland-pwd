import { loadOwnSkins, removeOwnSkin } from "../actions/own-skins.js";
import { REALM_LOOK_HOOK, endRealmLookPreview, getRealmLook, isRealmScene, previewRealmLook, setRealmLook } from "../actions/realm.js";
import { t } from "../chat/cards.js";
import { realmTextures } from "../rules/realm-documents.js";
import {
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
 * The GM's window for how a Realm Scene looks: a skin, shipped or made of
 * their own pictures, and a colour set. Choices are tried out in the preview, and reach the
 * Realm Scene being viewed when applied. With no Realm Scene in view, they
 * only change the look new Realms start with.
 */
export class RealmAppearance extends ArtPreviewMixin(HandlebarsApplicationMixin(ApplicationV2)) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-realm-appearance",
		classes: [SYSTEM_ID, "bastionland", "bastionland-realm-appearance-window"],
		tag: "div",
		position: { width: 680, height: "auto" },
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
			changed: !sameLook(draft, getRealmLook(this.#scene))
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
			this.#scene = viewedRealm();
			if (unchanged) this.#draft = getRealmLook(this.#scene);
			if (this.rendered) this.render();
		});
	}

	/** @override */
	_onRender(context, options) {
		super._onRender(context, options);
		// What's being tried out shows on the Realm Scene being viewed, for this GM only.
		previewRealmLook(this.#draft);
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		// Whatever wasn't applied is let go, and the Scenes go back to the saved look.
		this.#takeUpViewedRealm();
		endRealmLookPreview();
		if (this.#hook !== null) Hooks.off(REALM_LOOK_HOOK, this.#hook);
		if (this.#canvasHook !== null) Hooks.off("canvasReady", this.#canvasHook);
		this.#hook = null;
		this.#canvasHook = null;
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
				this.#change(ownSkinLook(saved, this.#draft.palette));
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
		if (skin) this.#change(ownSkinLook(skin, this.#draft.palette));
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
		if (sameLook(this.#draft, getRealmLook(scene))) return;
		// The preview only changed this browser's copy, which would make the saved Scene look up to date already.
		await endRealmLookPreview({ redraw: false });
		await setRealmLook(scene, this.#draft);
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
