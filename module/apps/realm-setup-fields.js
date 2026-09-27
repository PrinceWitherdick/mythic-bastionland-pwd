/**
 * The Custom Realm section of the New Realm dialog: its rows, and the way its
 * fields answer each other.
 */
import { t } from "../chat/cards.js";
import { barrierCount } from "../rules/realm.js";
import { BOOK_SETUP, SETUP_LIMITS, SETUP_PARTS, setupBarriers, within } from "../rules/realm-setup.js";
import { LANDMARK_TYPES } from "../rules/realm.js";

/**
 * The Custom Realm rows: the map's size, then each part the generator rolls,
 * with the book's numbers (p14) filled in.
 * @returns {{key: string, label: string, rollable: boolean, note: string|null,
 *   fields: {name: string, label: string|null, value: number, min: number, max: number}[],
 *   more: object[], moreNote: string|null}[]} `more` are fields a part may fill in beyond its own, such as a count for one type of Landmark.
 */
export function setupParts() {
	const field = (key, value, name = key, label = null) => ({ name: `setup.${name}`, label, value, ...SETUP_LIMITS[key] });
	const labelled = (key, value) => field(key, value, key, t(`realm.setup.fields.${key}`));
	const fields = {
		terrain: [labelled("cluster", BOOK_SETUP.cluster), labelled("lakes", BOOK_SETUP.lakes)],
		rivers: [],
		holdings: [field("holdings", BOOK_SETUP.holdings)],
		myths: [field("myths", BOOK_SETUP.myths)],
		landmarks: [
			field("landmarks", BOOK_SETUP.landmarks.min, "landmarks.min", t("realm.setup.fields.landmarksMin")),
			field("landmarks", BOOK_SETUP.landmarks.max, "landmarks.max", t("realm.setup.fields.landmarksMax"))
		],
		barriers: [field("barriers", setupBarriers(BOOK_SETUP))]
	};
	const notes = ["rivers", "holdings", "myths", "landmarks", "barriers"];
	// Each type of Landmark may be given a count of its own (p202); left blank, it takes the range above.
	const more = {
		landmarks: LANDMARK_TYPES.map((type) => ({ ...field("landmarks", "", `landmarks.types.${type}`, t(`realm.landmarks.${type}`)), placeholder: "—" }))
	};
	return [
		{ key: "map", label: t("realm.setup.parts.map"), rollable: false, note: null, fields: [labelled("cols", BOOK_SETUP.cols), labelled("rows", BOOK_SETUP.rows)] },
		...SETUP_PARTS.map((key) => ({
			key,
			label: t(`realm.setup.parts.${key}`),
			rollable: true,
			note: notes.includes(key) ? t(`realm.setup.notes.${key}`) : null,
			fields: fields[key],
			more: more[key] ?? [],
			moreNote: more[key] ? t(`realm.setup.more.${key}`) : null
		}))
	];
}

/**
 * Wire up the Custom Realm fields. The numbers are the book's, and locked,
 * until the GM ignores the rules; a part left to draw by hand has no numbers to
 * give. Until the GM sets the Barriers themselves, they stay at one sixth of
 * the map.
 * @param {HTMLElement} element The dialog.
 */
export function wireSetupFields(element) {
	const ignore = element.querySelector("[data-setup-ignore]");
	if (!ignore) return;
	const numbers = [...element.querySelectorAll("[data-setup-number]")];
	const barriers = element.querySelector('[name="setup.barriers"]');
	const sides = ["cols", "rows"].map((key) => ({ key, input: element.querySelector(`[name="setup.${key}"]`) }));

	const refresh = () => {
		for (const part of element.querySelectorAll("[data-setup-part]")) {
			const off = part.querySelector("[data-setup-roll]")?.checked === false;
			part.classList.toggle("is-off", off);
			for (const input of part.querySelectorAll("[data-setup-number]")) input.disabled = !ignore.checked || off;
		}
	};
	ignore.addEventListener("change", () => {
		if (!ignore.checked) {
			for (const input of numbers) input.value = input.dataset.book;
			delete barriers?.dataset.edited;
		}
		refresh();
	});
	for (const box of element.querySelectorAll("[data-setup-roll]")) box.addEventListener("change", refresh);
	barriers?.addEventListener("input", () => { barriers.dataset.edited = "true"; });
	for (const { input } of sides) {
		input?.addEventListener("input", () => {
			if (!barriers || barriers.dataset.edited) return;
			const [cols, rows] = sides.map(({ key, input: side }) => within(side?.value, SETUP_LIMITS[key].min, SETUP_LIMITS[key]));
			barriers.value = barrierCount({ cols, rows });
		});
	}
	refresh();
}
