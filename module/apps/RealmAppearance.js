import { REALM_LOOK_HOOK, getRealmLook, setRealmLook } from "../actions/realm.js";
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
	defaultRealmLook,
	matchCustomFiles,
	normaliseRealmLook,
	paletteSwatches,
	realmSetDir
} from "../rules/realm-skins.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { chooseLocalFiles, singletonOpener } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** The pictures each skin's card shows it by. */
const SAMPLES = Object.freeze(["terrain-05", "holding-castle", "landmark-sanctum", "myth-3"]);

const sameLook = (a, b) => JSON.stringify(normaliseRealmLook(a)) === JSON.stringify(normaliseRealmLook(b));

/**
 * The GM's window for how Realm Scenes look: a skin, a colour set, and
 * pictures of their own. Choices are tried out in the preview, and reach the
 * Scenes when applied.
 */
export class RealmAppearance extends HandlebarsApplicationMixin(ApplicationV2) {
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
			reset: RealmAppearance.#onReset,
			apply: RealmAppearance.#onApply
		}
	};

	static PARTS = {
		appearance: { template: templatePath("apps/realm-appearance.hbs"), scrollable: [""] }
	};

	/** The look being tried out. */
	#draft = getRealmLook();

	/** @type {number|null} */
	#hook = null;

	/** @override */
	async _prepareContext(options) {
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
			changed: !sameLook(draft, getRealmLook())
		});
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		// Another GM's change, or one applied here, becomes what's tried out.
		this.#hook = Hooks.on(REALM_LOOK_HOOK, (look) => {
			this.#draft = look;
			if (this.rendered) this.render();
		});
	}

	/** @override */
	_onRender(context, options) {
		super._onRender(context, options);
		const input = this.element.querySelector("input[type=file]");
		input?.addEventListener("change", () => this.#upload([...(input.files ?? [])]));
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		// Whatever wasn't applied is let go.
		this.#draft = getRealmLook();
		if (this.#hook !== null) Hooks.off(REALM_LOOK_HOOK, this.#hook);
		this.#hook = null;
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
	static #onReset() {
		this.#draft = defaultRealmLook();
		this.render();
	}

	/** @this {RealmAppearance} */
	static async #onApply() {
		if (sameLook(this.#draft, getRealmLook())) return;
		await setRealmLook(this.#draft);
		ui.notifications.info(t("realm.look.applied"));
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
