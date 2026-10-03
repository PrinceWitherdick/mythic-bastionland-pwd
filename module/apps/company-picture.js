/**
 * The picture the one Company Token carries (p7): the gallery shared by the
 * New Realm dialog and the window a Referee opens by double clicking the
 * Company on a Realm, the colour it's carried in, and the fields that answer
 * each other inside it.
 *
 * A recoloured icon is a file of its own, written into the system's art folder
 * once the choice is made: a Token's picture has to be a path, so the colour
 * can't ride along with it.
 */
import { t } from "../chat/cards.js";
import { ensureDirectories, filePicker, uploadFile } from "../book-art/files.js";
import { inputDialog, markActive } from "./ui.js";
import { COMPANY_IMG_FLAG, companyPicture } from "../actions/company.js";
import {
	COMPANY_ART_FOLDER,
	COMPANY_COLOURS,
	COMPANY_ICON_FILL,
	COMPANY_IMAGE,
	companyIconFile,
	companyIconFromPath,
	companyIconPath,
	companyPictureChoices,
	forgetOwnCompanyPicture,
	keepOwnCompanyPicture,
	ownCompanyPictureChoices,
	tintCompanyIcon
} from "../rules/company-icons.js";
import { ART_ROOT } from "../rules/book-art.js";
import { SYSTEM_ID } from "../system-id.js";
import { read } from "../client-settings.js";
import { serialWrites } from "../rules/queue.js";

/** Where recoloured icons are written. */
const COMPANY_ART_DIR = `${ART_ROOT}/${COMPANY_ART_FOLDER}`;

/** World setting keeping the Referee's own pictures, newest first, so each is a tile in the gallery after. */
const OWN_PICTURES_SETTING = "companyPictures";

/** Register the setting the Referee's own pictures are kept in. Called during init. */
export function registerCompanyPictureSetting() {
	game.settings.register(SYSTEM_ID, OWN_PICTURES_SETTING, {
		scope: "world",
		config: false,
		type: Array,
		default: []
	});
}

/** @returns {string[]} The Referee's own pictures kept so far, newest first. */
const ownPictures = () => keepOwnCompanyPicture(read(OWN_PICTURES_SETTING, []));

/**
 * Keep a picture of the Referee's own, so it's offered in the gallery next
 * time. The gallery's icons are left out, since they have tiles already.
 * @param {string} path
 */
async function keepOwnPicture(path) {
	await saveOwnPictures((kept) => keepOwnCompanyPicture(kept, path));
}

/** Writes to the Referee's own pictures, one at a time, so two at once don't each undo the other. */
const queueOwnPictures = serialWrites();

/**
 * Write the Referee's own pictures back, changed, if they changed at all.
 * @param {(kept: string[]) => string[]} change
 */
function saveOwnPictures(change) {
	if (!game.user?.isGM) return Promise.resolve();
	return queueOwnPictures(async () => {
		const kept = ownPictures();
		const next = change(kept);
		if (foundry.utils.objectsEqual(next, kept)) return;
		try {
			await game.settings.set(SYSTEM_ID, OWN_PICTURES_SETTING, next);
		} catch (error) {
			console.error(error);
		}
	});
}

/**
 * @param {string} path
 * @returns {boolean} Whether the picture is a video, which an `img` tile can't show though the file is there.
 */
const isVideo = (path) => Object.hasOwn(CONST.VIDEO_FILE_EXTENSIONS ?? {}, String(path).split(/[?#]/)[0].split(".").pop().toLowerCase());

/**
 * What the shared partial is drawn from.
 * @param {string} [current] The picture already chosen, shipped or recoloured.
 * @returns {{img: string, colour: string, pictures: object[], colours: object[]}}
 */
export function companyPictureContext(current = COMPANY_IMAGE) {
	const chosen = companyIconFromPath(current);
	const colour = chosen?.color ?? COMPANY_ICON_FILL;
	return {
		img: current,
		colour,
		// Which tile and swatch are the chosen ones is marked by `wireCompanyPicture`
		// when the window is drawn, so it isn't worked out a second time here.
		pictures: companyPictureChoices(),
		// The Referee's own, and the one carried now if it's theirs and was chosen before they were kept.
		own: ownCompanyPictureChoices(keepOwnCompanyPicture(ownPictures(), current)),
		colours: COMPANY_COLOURS.map(({ key, color }) => ({
			key,
			color,
			label: t(key === "ink" ? "company.inkColour" : `heraldry.tinctures.${key}.label`)
		}))
	};
}

/**
 * @param {string} svg
 * @returns {string} The picture as a source an `img` can show, so a colour can
 *   be tried on without anything being written anywhere.
 */
const svgSource = (svg) => `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;

/**
 * Each shipped icon's file, read once for the session rather than once per
 * opening of the dialog. Null for one the server wouldn't give up, which is
 * shown in the ink it was drawn in instead.
 * @type {Map<string, string|null>}
 */
const SOURCES = new Map();

/**
 * Read whichever of the gallery's files haven't been read yet, together rather
 * than one waiting on the last.
 * @param {string[]} keys
 * @returns {Promise<void>}
 */
async function readIcons(keys) {
	await Promise.all(keys.filter((key) => !SOURCES.has(key)).map(async (key) => {
		try {
			SOURCES.set(key, await (await fetch(companyIconPath(key))).text());
		} catch {
			SOURCES.set(key, null);
		}
	}));
}

/**
 * The fields: a tile from the gallery fills the picture field, a swatch
 * recolours every tile, and the field still takes any picture of the
 * Referee's own, browsed for or typed in. The colours go quiet while a
 * picture of their own is in the field, which is left as it is.
 * @param {HTMLElement} element The window holding them.
 */
export function wireCompanyPicture(element) {
	const field = element.querySelector('[name="companyImg"]');
	const colourField = element.querySelector('[name="companyColour"]');
	const gallery = [...element.querySelectorAll("[data-company-picture]")];
	const swatches = [...element.querySelectorAll("[data-company-colour]")];
	const colours = element.querySelector("[data-company-colours]");
	const own = element.querySelector("[data-company-own-colour]");

	/** Counts paints, so a slow fetch that's been overtaken doesn't put an old colour back. */
	let painted = 0;

	/** Mark the chosen tile and swatch, and grey the colours out while the picture isn't one of ours. */
	const markChosen = () => {
		const chosen = companyIconFromPath(field?.value);
		for (const button of gallery) {
			const icon = button.dataset.companyIcon;
			markActive(button, icon ? icon === chosen?.key : button.dataset.companyPicture === field?.value.trim());
		}
		for (const button of swatches) markActive(button, Boolean(chosen) && button.dataset.companyColour === colourField?.value);
		colours?.classList.toggle("is-off", !chosen);
	};

	/** Show every tile in the colour in hand. */
	const paint = async () => {
		const colour = colourField?.value || COMPANY_ICON_FILL;
		const draw = ++painted;
		const tiles = gallery
			.map((button) => ({ key: button.dataset.companyIcon, picture: button.querySelector("img") }))
			.filter(({ key, picture }) => key && picture);
		await readIcons(tiles.map(({ key }) => key));
		if (draw !== painted) return;
		for (const { key, picture } of tiles) {
			const svg = SOURCES.get(key);
			picture.src = svg ? svgSource(tintCompanyIcon(svg, colour)) : companyIconPath(key);
		}
	};

	/** Take a picture, from the gallery or the file picker, and show it as the chosen one. */
	const choose = (path) => {
		if (!field || !path) return;
		field.value = path;
		markChosen();
	};

	/** Take a colour, and show every icon in it. */
	const recolour = (value) => {
		if (!colourField || !value) return;
		colourField.value = String(value).toLowerCase();
		markChosen();
		paint();
	};

	for (const button of gallery) button.addEventListener("click", () => choose(button.dataset.companyPicture));
	// The × on a picture of the Referee's own takes it out of the gallery, leaving the file where it is.
	for (const button of element.querySelectorAll("[data-company-forget]")) {
		button.addEventListener("click", () => {
			const path = button.dataset.companyForget;
			button.closest("li")?.remove();
			saveOwnPictures((kept) => forgetOwnCompanyPicture(kept, path));
		});
	}

	// A kept picture whose file has since gone is left out rather than shown broken,
	// and forgotten, so it doesn't hold a place in the gallery.
	for (const picture of element.querySelectorAll("[data-company-own] img")) {
		picture.addEventListener("error", () => {
			const path = picture.closest("[data-company-own]")?.dataset.companyPicture;
			picture.closest("li")?.remove();
			if (path && !isVideo(path)) saveOwnPictures((kept) => forgetOwnCompanyPicture(kept, path));
		}, { once: true });
	}
	for (const button of swatches) button.addEventListener("click", () => recolour(button.dataset.companyColour));
	own?.addEventListener("input", () => recolour(own.value));
	field?.addEventListener("input", markChosen);

	element.querySelector("[data-company-browse]")?.addEventListener("click", () => {
		const FilePicker = filePicker();
		new FilePicker({
			type: "imagevideo",
			current: field?.value || COMPANY_IMAGE,
			callback: choose
		}).render({ force: true });
	});

	markChosen();
	if (colourField?.value && colourField.value !== COMPANY_ICON_FILL) paint();
}

/**
 * The picture a Company will carry, from what the dialog came back with: the
 * shipped icon while it's drawn in ink, a recoloured one written into the art
 * folder otherwise, and a picture of the Referee's own untouched.
 * @param {object} data The dialog's form data.
 * @param {object} [options]
 * @param {string} [options.was] The picture carried before. A picture of the
 *   Referee's own is kept for the gallery only when they've just chosen it, so
 *   art the Token came with isn't kept as theirs.
 * @returns {Promise<string>} The path to give the Token.
 */
export async function resolveCompanyPicture(data, { was } = {}) {
	const img = String(data?.companyImg ?? "").trim() || COMPANY_IMAGE;
	const chosen = companyIconFromPath(img);
	if (!chosen) {
		if (img !== was) await keepOwnPicture(img);
		return img;
	}

	const colour = String(data?.companyColour ?? "").trim().toLowerCase();
	const shipped = companyIconPath(chosen.key);
	if (!colour || colour === COMPANY_ICON_FILL) return shipped;

	try {
		const svg = tintCompanyIcon(await (await fetch(shipped)).text(), colour);
		await ensureDirectories([ART_ROOT, COMPANY_ART_DIR]);
		const file = new File([svg], companyIconFile(chosen.key, colour), { type: "image/svg+xml" });
		const path = await uploadFile(COMPANY_ART_DIR, file);
		if (path) return path;
	} catch (error) {
		console.error(error);
	}
	ui.notifications.warn(t("company.colourFailed"));
	return shipped;
}

/**
 * Ask the Referee which picture the Company carries, and give it to their
 * Token. The Scene keeps it too, so a Company taken off the map and stood in a
 * hex again comes back with the same picture.
 * @param {TokenDocument} token The Company's Token.
 * @returns {Promise<boolean>} Whether the picture was changed.
 */
export async function changeCompanyPicture(token) {
	if (!game.user.isGM || !token) return false;
	const current = token.texture?.src || companyPicture(token.parent);
	const data = await inputDialog({
		title: t("company.picture"),
		icon: "fa-solid fa-flag",
		template: "company-picture",
		context: companyPictureContext(current),
		ok: { label: t("company.usePicture"), icon: "fa-solid fa-flag" },
		position: { width: 460 },
		render: (_event, dialog) => wireCompanyPicture(dialog.element)
	});
	if (!data) return false;

	const img = await resolveCompanyPicture(data, { was: current });
	if (!img || img === current) return false;
	await token.update({ "texture.src": img });
	await token.parent?.setFlag(SYSTEM_ID, COMPANY_IMG_FLAG, img);
	return true;
}
