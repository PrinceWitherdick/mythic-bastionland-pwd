/**
 * Expand the map: the window a Referee makes a standing Realm's map bigger
 * from. Four numbers, one for each side, with the map drawn small and the new
 * hexes round it as they're typed; what becomes of the new land; how the hexes
 * are numbered, once they've moved; and the backup kept first, with the way
 * back to it.
 */
import { t } from "../chat/cards.js";
import { OWN_SIZE_LIMITS } from "../rules/realm-setup.js";
import {
	GROWTH_SIDES,
	REALM_BACKUP_FLAG,
	REALM_GROWTH_FLAG,
	growsAtAll,
	growthPreview,
	growthProblem,
	grownSize,
	hasShifted,
	normaliseGrowth
} from "../rules/realm-growth.js";
import { SYSTEM_ID } from "../system-id.js";
import { inputDialog } from "./ui.js";

/** The ways the hexes may be numbered once the map has grown north or west. */
const NUMBERINGS = Object.freeze(["keep", "renumber"]);

/**
 * @param {{cols: number, rows: number}} g
 * @param {import("../rules/realm-growth.js").Growth} growth
 * @returns {string} e.g. "14 by 12, 168 hexes".
 */
const sizeText = (g, growth) => t("realm.expand.size", grownSize(g, growth));

/**
 * @param {Scene} scene
 * @returns {{path: string, when: number}|null} The backup the Realm was last kept in before an expansion.
 */
export function realmBackup(scene) {
	const backup = scene?.flags?.[SYSTEM_ID]?.[REALM_BACKUP_FLAG];
	return typeof backup?.path === "string" && Number.isFinite(backup.when) ? backup : null;
}

/**
 * @param {number} when
 * @returns {string} The day and time, as the Referee's browser writes them.
 */
const dateText = (when) => new Date(when).toLocaleString();

/**
 * @param {Scene} scene
 * @param {object} realm
 * @param {object} g
 * @returns {object} What the window's template is drawn from.
 */
function expandContext(scene, realm, g) {
	const picture = Boolean(realm.picture);
	// Land a Realm rolled is rolled again; land drawn by hand, or under a picture of the Referee's, is left to paint.
	const rolled = realm.setup?.roll?.terrain !== false && !picture;
	const backup = realmBackup(scene);
	const nothing = normaliseGrowth(null);
	return {
		sides: GROWTH_SIDES.map((key) => ({ key, label: t(`realm.expand.sides.${key}`), max: key === "north" || key === "south" ? OWN_SIZE_LIMITS.rows.max : OWN_SIZE_LIMITS.cols.max })),
		preview: growthPreview(g, nothing),
		size: sizeText(g, nothing),
		lands: [
			{ key: "roll", label: t("realm.expand.land.roll"), detail: t("realm.expand.land.rollDetail"), checked: rolled },
			{ key: "blank", label: t("realm.expand.land.blank"), detail: t("realm.expand.land.blankDetail"), checked: !rolled }
		],
		picture,
		inkOutside: Boolean(realm.picture?.players?.inkOutside),
		// Offered once hexes are added north or west, or an earlier expansion has already moved them.
		numberingShown: hasShifted(scene.flags?.[SYSTEM_ID]?.[REALM_GROWTH_FLAG]),
		numberings: NUMBERINGS.map((key, index) => ({ key, label: t(`realm.expand.numbers.${key}`), detail: t(`realm.expand.numbers.${key}Detail`), checked: index === 0 })),
		backup: backup ? { said: t("realm.expand.backup.kept", { when: dateText(backup.when) }), label: t("realm.expand.backup.restore", { when: dateText(backup.when) }) } : null
	};
}

/**
 * Keep the window in step with the numbers typed: the map drawn again, its
 * size, why it can't grow so, the numbering choice once it applies, and OK
 * only while there's something it can do.
 * @param {HTMLElement} element
 * @param {Scene} scene
 * @param {object} g
 */
function wireExpandFields(element, scene, g) {
	const shifted = hasShifted(scene.flags?.[SYSTEM_ID]?.[REALM_GROWTH_FLAG]);
	const ok = element.querySelector("button[data-action='ok']");
	const read = () => normaliseGrowth(Object.fromEntries([...element.querySelectorAll("[data-expand-side]")].map((input) => [input.name, input.value])));
	const update = () => {
		const growth = read();
		const preview = growthPreview(g, growth);
		element.querySelector("[data-expand-map]")?.setAttribute("viewBox", preview.viewBox);
		element.querySelector("[data-expand-old]")?.setAttribute("d", preview.old);
		element.querySelector("[data-expand-added]")?.setAttribute("d", preview.added);
		const size = element.querySelector("[data-expand-size]");
		if (size) size.textContent = sizeText(g, growth);
		const problem = growthProblem(g, growth);
		const said = element.querySelector("[data-expand-problem]");
		// Nothing typed yet isn't worth a word; OK simply waits.
		const shown = problem && problem !== "nothing";
		if (said) {
			said.hidden = !shown;
			said.textContent = shown ? t(`realm.expand.problems.${problem}`, { cols: OWN_SIZE_LIMITS.cols.max, rows: OWN_SIZE_LIMITS.rows.max, hexes: OWN_SIZE_LIMITS.hexes }) : "";
		}
		if (ok) ok.disabled = Boolean(problem);
		const numbering = element.querySelector("[data-expand-numbering]");
		if (numbering) numbering.hidden = !(shifted || growth.north > 0 || growth.west > 0);
	};
	for (const input of element.querySelectorAll("[data-expand-side]")) input.addEventListener("input", update);
	update();
}

/**
 * @typedef {object} ExpandChoice
 * @property {"expand"|"restore"} action
 * @property {import("../rules/realm-growth.js").Growth} [growth]
 * @property {"roll"|"blank"} [land]
 * @property {boolean} [features] Roll Landmarks and Barriers into the new land too.
 * @property {boolean} [keepNumbers]
 * @property {boolean} [backup] Keep a backup on the server first.
 * @property {boolean} [inkOutside] Draw new land outside a picture in the Realm's own ink.
 */

/**
 * Ask the Referee how to grow a Realm's map, or whether to put it back from its backup.
 * @param {Scene} scene
 * @param {object} realm
 * @param {object} g
 * @returns {Promise<ExpandChoice|null>} Null if closed.
 */
export async function askToExpandRealm(scene, realm, g) {
	let restore = false;
	const data = await inputDialog({
		title: t("realm.expand.title"),
		icon: "fa-solid fa-expand",
		template: "realm-expand",
		context: expandContext(scene, realm, g),
		ok: { label: t("realm.expand.ok"), icon: "fa-solid fa-expand" },
		// The map is drawn as SVG.
		drawings: true,
		position: { width: 820 },
		render: (_event, dialog) => {
			wireExpandFields(dialog.element, scene, g);
			dialog.element.querySelector("[data-expand-restore]")?.addEventListener("click", () => {
				restore = true;
				dialog.close();
			});
		}
	});
	if (restore) return { action: "restore" };
	if (!data) return null;
	const growth = normaliseGrowth(data);
	if (!growsAtAll(growth)) return null;
	return {
		action: "expand",
		growth,
		land: data.land === "roll" ? "roll" : "blank",
		features: Boolean(data.features),
		keepNumbers: data.numbering !== "renumber",
		backup: Boolean(data.backup),
		inkOutside: Boolean(data.inkOutside)
	};
}
