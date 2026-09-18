import { REALM_LOOK_HOOK, endRealmLookPreview, getRealmLook, isRealmScene, previewRealmLook, setRealmLook } from "../actions/realm.js";
import { ensureDirectories, filePicker, uploadFile } from "../book-art/files.js";
import { t } from "../chat/cards.js";
import { ART_ROOT } from "../rules/book-art.js";
import { HOLDING_STYLES, LANDMARK_TYPES, MYTH_COUNT, RIVER_SHAPES, TERRAIN } from "../rules/realm.js";
import { realmTextures } from "../rules/realm-documents.js";
import {
	PICTURE_NAME,
	REALM_CUSTOM_DIR,
	REALM_PALETTES,
	REALM_PICTURES,
	REALM_SKINS,
	TERRAIN_FITS,
	customPictureName,
	matchCustomFiles,
	normaliseRealmLook,
	paletteSwatches,
	realmSetDir
} from "../rules/realm-skins.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { ArtPreviewMixin } from "./art-preview.js";
import { chooseLocalFiles, singletonOpener } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** The pictures each skin's card shows it by. */
const SAMPLES = Object.freeze(["terrain-05", "holding-castle", "landmark-sanctum", "myth-3"]);

/** @returns {Scene|null} The Realm Scene this GM is viewing, if any. */
const viewedRealm = () => (isRealmScene(canvas?.scene) ? canvas.scene : null);

const sameLook = (a, b) => JSON.stringify(normaliseRealmLook(a)) === JSON.stringify(normaliseRealmLook(b));

/**
 * The GM's window for how a Realm Scene looks: a skin, a colour set, and
 * pictures of their own. Choices are tried out in the preview, and reach the
 * Realm Scene being viewed when applied. With no Realm Scene in view, they
 * only change the look new Realms start with.
 */
export class RealmAppearance extends ArtPreviewMixin(HandlebarsApplicationMixin(ApplicationV2)) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-realm-appearance",
		classes: [SYSTEM_ID, "bastionland", "bastionland-realm-appearance-window"],
		tag: "form",
		position: { width: 680, height: "auto" },
		window: { title: "bastionland.realm.look.title", icon: "fa-solid fa-palette", resizable: true },
		form: { handler: RealmAppearance.#onChangeForm, submitOnChange: true, closeOnSubmit: false },
		actions: {
			pickSkin: RealmAppearance.#onPickSkin,
			pickPalette: RealmAppearance.#onPickPalette,
			upload: RealmAppearance.#onUpload,
			chooseFolder: RealmAppearance.#onChooseFolder,
			rescan: RealmAppearance.#onRescan,
			clearCustom: RealmAppearance.#onClearCustom,
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
		if (options.isFirstRender) this.#takeUpViewedRealm();
		const context = await super._prepareContext(options);
		const draft = this.#draft;
		const textures = realmTextures(draft);
		const { files } = draft.custom;
		const picture = (name, src, label) => ({ src, label, own: Boolean(files[name]) });
		const found = REALM_PICTURES.filter((name) => files[name]);

		return Object.assign(context, {
			skins: REALM_SKINS.map((key) => ({
				key,
				label: t(`realm.look.skins.${key}.label`),
				hint: t(`realm.look.skins.${key}.hint`),
				active: key === draft.skin,
				samples: SAMPLES.map((name) => `${realmSetDir(key, draft.palette)}/${name}.svg`)
			})),
			palettes: REALM_PALETTES.map(({ key }) => ({
				key,
				label: t(`realm.look.palettes.${key}`),
				active: key === draft.palette,
				swatches: paletteSwatches(key)
			})),
			custom: {
				folder: draft.custom.folder,
				fits: TERRAIN_FITS.map((value) => ({ value, label: t(`realm.look.fits.${value}`), selected: value === draft.custom.terrainFit })),
				count: t("realm.look.found", { found: found.length, total: REALM_PICTURES.length }),
				any: found.length > 0,
				dir: REALM_CUSTOM_DIR
			},
			canUpload: game.user.can("FILES_UPLOAD"),
			canBrowse: game.user.can("FILES_BROWSE"),
			paper: textures.colours.paper,
			groups: [
				{
					label: t("realm.panel.terrain"),
					hexes: true,
					pictures: TERRAIN.map((key, index) => picture(PICTURE_NAME.terrain(index + 1), textures.terrain[index + 1].src, `${index + 1}. ${t(`realm.terrain.${key}`)}`))
				},
				{
					label: t("realm.look.features"),
					pictures: [
						...HOLDING_STYLES.map((style) => picture(PICTURE_NAME.holding(style), textures.holding[style].src, t(`realm.holdings.${style}`))),
						picture(PICTURE_NAME.seat, textures.seat.src, t("realm.key.seat")),
						...LANDMARK_TYPES.map((type) => picture(PICTURE_NAME.landmark(type), textures.landmark[type].src, t(`realm.landmarks.${type}`))),
						...Array.from({ length: MYTH_COUNT }, (_, index) => picture(PICTURE_NAME.myth(index + 1), textures.myth[index + 1].src, t("realm.readout.myth", { number: index + 1 })))
					]
				},
				{
					label: t("realm.look.river"),
					hexes: true,
					pictures: RIVER_SHAPES.map((shape) => picture(PICTURE_NAME.river(shape), textures.river[shape].src, t(`realm.look.rivers.${shape}`)))
				}
			],
			names: REALM_PICTURES.map((name) => ({ name, found: Boolean(files[name]) })),
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
		const input = this.element.querySelector("input[type=file]");
		input?.addEventListener("change", () => this.#upload([...(input.files ?? [])]));
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
	 * Save a GM's own pictures into the world's folder for them, then use that folder.
	 * @param {File[]} chosen
	 */
	async #upload(chosen) {
		const pictures = chosen.filter((file) => customPictureName(file.name));
		const ignored = chosen.length - pictures.length;
		if (ignored) ui.notifications.warn(t("realm.look.ignored", { count: ignored }));
		if (!pictures.length) return;

		await ensureDirectories([ART_ROOT, REALM_CUSTOM_DIR]);
		const saved = await Promise.all(pictures.map((file) => uploadFile(REALM_CUSTOM_DIR, file)));
		const failed = saved.filter((path) => !path).length;
		if (failed) ui.notifications.error(t("realm.look.uploadFailed", { count: failed }));
		await this.#scan(REALM_CUSTOM_DIR);
	}

	/**
	 * Use the pictures in a folder, matched by their names.
	 * @param {string} folder
	 */
	async #scan(folder) {
		let files;
		try {
			({ files = [] } = await filePicker().browse("data", folder));
		} catch (error) {
			console.error(error);
			ui.notifications.error(t("realm.look.browseFailed", { folder }));
			return;
		}
		const matched = matchCustomFiles(files);
		const count = Object.keys(matched).length;
		ui.notifications[count ? "info" : "warn"](t("realm.look.scanned", { count, total: REALM_PICTURES.length, folder }));
		this.#change({ custom: { ...this.#draft.custom, folder, files: matched } });
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {RealmAppearance} */
	static #onChangeForm(_event, _form, formData) {
		const { terrainFit } = formData.object;
		this.#change({ custom: { ...this.#draft.custom, terrainFit } });
	}

	/** @this {RealmAppearance} */
	static #onPickSkin(_event, target) {
		this.#change({ skin: target.dataset.skin });
	}

	/** @this {RealmAppearance} */
	static #onPickPalette(_event, target) {
		this.#change({ palette: target.dataset.palette });
	}

	/** @this {RealmAppearance} */
	static #onUpload() {
		chooseLocalFiles(this.element);
	}

	/** @this {RealmAppearance} */
	static #onChooseFolder() {
		const FilePicker = filePicker();
		new FilePicker({
			type: "folder",
			current: this.#draft.custom.folder || REALM_CUSTOM_DIR,
			callback: (path) => path && this.#scan(path.replace(/\/$/, ""))
		}).render({ force: true });
	}

	/** @this {RealmAppearance} */
	static #onRescan() {
		if (this.#draft.custom.folder) this.#scan(this.#draft.custom.folder);
	}

	/**
	 * Stop using the GM's own pictures. The files stay where they are.
	 * @this {RealmAppearance}
	 */
	static #onClearCustom() {
		this.#change({ custom: { ...this.#draft.custom, folder: "", files: {} } });
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
