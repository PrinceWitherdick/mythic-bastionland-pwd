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
	tintCompanyIcon
} from "../rules/company-icons.js";
import { ART_ROOT } from "../rules/book-art.js";
import { SYSTEM_ID } from "../system-id.js";

/** Where recoloured icons are written. */
const COMPANY_ART_DIR = `${ART_ROOT}/${COMPANY_ART_FOLDER}`;

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
		for (const button of gallery) markActive(button, button.dataset.companyIcon === chosen?.key);
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
 * @returns {Promise<string>} The path to give the Token.
 */
export async function resolveCompanyPicture(data) {
	const img = String(data?.companyImg ?? "").trim() || COMPANY_IMAGE;
	const chosen = companyIconFromPath(img);
	if (!chosen) return img;

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

	const img = await resolveCompanyPicture(data);
	if (!img || img === current) return false;
	await token.update({ "texture.src": img });
	await token.parent?.setFlag(SYSTEM_ID, COMPANY_IMG_FLAG, img);
	return true;
}
