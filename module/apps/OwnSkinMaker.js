import { saveOwnSkin } from "../actions/own-skins.js";
import { filePicker } from "../book-art/files.js";
import { t } from "../chat/cards.js";
import { HOLDING_STYLES, LANDMARK_TYPES, MYTH_COUNT, RIVER_SHAPES, TERRAIN } from "../rules/realm.js";
import { realmTextures } from "../rules/realm-documents.js";
import {
	PICTURE_NAME,
	REALM_CUSTOM_DIR,
	REALM_PICTURES,
	REALM_SKINS,
	TERRAIN_FITS,
	customPictureName,
	matchCustomFiles,
	normaliseRealmLook
} from "../rules/realm-skins.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { ArtPreviewMixin } from "./art-preview.js";
import { chooseLocalFiles } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Every Realm picture a look draws, grouped as the Realm Appearance preview shows them.
 * @param {import("../rules/realm-skins.js").RealmLook} look
 * @param {ReturnType<typeof realmTextures>} [textures] The look's, when the caller has them already.
 * @returns {object[]}
 */
export function realmPictureGroups(look, textures = realmTextures(look)) {
	const { files } = normaliseRealmLook(look).custom;
	const picture = (name, src, label) => ({ src, label, own: Boolean(files[name]) });
	return [
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
	];
}

/**
 * The GM's window for making a skin of their own pictures, or changing one
 * made before. Saved under a name, the skin joins the others in Realm
 * Appearance, in this world and every other on the server.
 */
export class OwnSkinMaker extends ArtPreviewMixin(HandlebarsApplicationMixin(ApplicationV2)) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-realm-appearance-window"],
		tag: "form",
		position: { width: 620, height: "auto" },
		window: { title: "bastionland.realm.look.own.title", icon: "fa-solid fa-images", resizable: true },
		form: { handler: OwnSkinMaker.#onChangeForm, submitOnChange: true, closeOnSubmit: false },
		actions: {
			upload: OwnSkinMaker.#onUpload,
			chooseFolder: OwnSkinMaker.#onChooseFolder,
			clearPictures: OwnSkinMaker.#onClearPictures,
			save: OwnSkinMaker.#onSave
		}
	};

	static PREVIEWED_ART = ".bastionland-realm-appearance__group img";

	static PARTS = {
		maker: { template: templatePath("apps/own-skin-maker.hbs"), scrollable: [""] }
	};

	/**
	 * @param {object} options
	 * @param {string} options.palette The colours to show it in.
	 * @param {string} options.base The skin drawing the pictures not given.
	 * @param {import("../rules/realm-skins.js").OwnSkin} [options.skin] The skin being changed.
	 * @param {(skin: import("../rules/realm-skins.js").OwnSkin) => void} [options.onSaved]
	 */
	constructor({ palette, base, skin = null, onSaved = () => {}, ...options } = {}) {
		super(options);
		this.#palette = palette;
		this.#folder = skin?.folder ?? "";
		this.#name = skin?.name ?? "";
		this.#base = skin?.base ?? base;
		this.#fit = skin?.terrainFit ?? TERRAIN_FITS[0];
		this.#pictures = { ...(skin?.files ?? {}) };
		this.#onSaved = onSaved;
	}

	#palette;
	#folder;
	#name;
	#base;
	#fit;
	#onSaved;
	#saving = false;

	/** @type {Record<string, File|string>} By picture name: a file from the GM's computer, or a path on the server. */
	#pictures;

	/** @type {Map<File, string>} Addresses the browser shows the GM's own files by, until the window closes. */
	#urls = new Map();

	/** @override */
	get title() {
		return this.#folder ? t("realm.look.own.editTitle", { name: this.#name }) : t("realm.look.own.title");
	}

	/** @param {File|string} source */
	#src(source) {
		if (typeof source === "string") return source;
		if (!this.#urls.has(source)) this.#urls.set(source, URL.createObjectURL(source));
		return this.#urls.get(source);
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const files = Object.fromEntries(Object.entries(this.#pictures).map(([name, source]) => [name, this.#src(source)]));
		const look = { skin: this.#base, palette: this.#palette, custom: { folder: "", terrainFit: this.#fit, files } };
		const textures = realmTextures(look);
		return Object.assign(context, {
			name: this.#name,
			bases: REALM_SKINS.map((key) => ({ key, label: t(`realm.look.skins.${key}.label`), selected: key === this.#base })),
			fits: TERRAIN_FITS.map((value) => ({ value, label: t(`realm.look.fits.${value}`), selected: value === this.#fit })),
			count: t("realm.look.own.found", { found: Object.keys(files).length, total: REALM_PICTURES.length }),
			any: Object.keys(files).length > 0,
			canUpload: game.user.can("FILES_UPLOAD"),
			canBrowse: game.user.can("FILES_BROWSE"),
			names: REALM_PICTURES.map((name) => ({ name, found: Boolean(files[name]) })),
			groups: realmPictureGroups(look, textures),
			paper: textures.colours.paper,
			saving: this.#saving
		});
	}

	/** @override */
	_onRender(context, options) {
		super._onRender(context, options);
		const input = this.element.querySelector("input[type=file]");
		input?.addEventListener("change", () => this.#add([...(input.files ?? [])]));
		// Typing a name isn't a change until the field is left, and Save shouldn't have to wait for that.
		const name = this.element.querySelector("input[name=name]");
		name?.addEventListener("input", () => { this.#name = name.value; });
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		for (const url of this.#urls.values()) URL.revokeObjectURL(url);
		this.#urls.clear();
	}

	/**
	 * Take the pictures among the GM's files, going by their names. They're
	 * uploaded only when the skin is saved.
	 * @param {File[]} chosen
	 */
	#add(chosen) {
		let ignored = 0;
		for (const file of chosen) {
			const name = customPictureName(file.name);
			if (name) this.#pictures[name] = file;
			else ignored += 1;
		}
		if (ignored) ui.notifications.warn(t("realm.look.own.ignored", { count: ignored }));
		this.render();
	}

	/**
	 * Take the pictures in a folder on the server, matched by their names.
	 * @param {string} folder
	 */
	async #scan(folder) {
		let files;
		try {
			({ files = [] } = await filePicker().browse("data", folder));
		} catch (error) {
			console.error(error);
			ui.notifications.error(t("realm.look.own.browseFailed", { folder }));
			return;
		}
		const matched = matchCustomFiles(files);
		const count = Object.keys(matched).length;
		ui.notifications[count ? "info" : "warn"](t("realm.look.own.scanned", { count, total: REALM_PICTURES.length, folder }));
		Object.assign(this.#pictures, matched);
		this.render();
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {OwnSkinMaker} */
	static #onChangeForm(_event, _form, formData) {
		const { name, base, terrainFit } = formData.object;
		this.#name = name ?? this.#name;
		if (REALM_SKINS.includes(base)) this.#base = base;
		if (TERRAIN_FITS.includes(terrainFit)) this.#fit = terrainFit;
		this.render();
	}

	/** @this {OwnSkinMaker} */
	static #onUpload() {
		chooseLocalFiles(this.element);
	}

	/** @this {OwnSkinMaker} */
	static #onChooseFolder() {
		const FilePicker = filePicker();
		new FilePicker({
			type: "folder",
			current: REALM_CUSTOM_DIR,
			callback: (path) => path && this.#scan(path.replace(/\/$/, ""))
		}).render({ force: true });
	}

	/** @this {OwnSkinMaker} */
	static #onClearPictures() {
		this.#pictures = {};
		this.render();
	}

	/** @this {OwnSkinMaker} */
	static async #onSave() {
		const name = this.#name.trim();
		if (!name) {
			ui.notifications.warn(t("realm.look.own.needsName"));
			this.element.querySelector("input[name=name]")?.focus();
			return;
		}
		if (!Object.keys(this.#pictures).length) {
			ui.notifications.warn(t("realm.look.own.needsPictures"));
			return;
		}
		if (this.#saving) return;
		this.#saving = true;
		await this.render();
		try {
			const { skin, failed } = await saveOwnSkin({ name, base: this.#base, terrainFit: this.#fit, pictures: this.#pictures, folder: this.#folder });
			if (failed) ui.notifications.error(t("realm.look.own.uploadFailed", { count: failed }));
			if (!skin) {
				ui.notifications.error(t("realm.look.own.saveFailed", { name }));
				return;
			}
			ui.notifications.info(t("realm.look.own.saved", { name }));
			this.#onSaved(skin);
			await this.close();
		} finally {
			this.#saving = false;
			if (this.rendered) this.render();
		}
	}
}
