import { inputDialog } from "../apps/ui.js";
import { pickImageInto } from "../book-art/files.js";
import { t } from "../chat/cards.js";
import { domainArms, rulingKnightOf } from "../rules/dominion.js";
import { worldKnights } from "./knights.js";

/**
 * @param {Actor} domain
 * @returns {Actor|null} The Knight ruling it: linked to it, or bearing its ruler's name.
 */
export const domainRuler = (domain) => rulingKnightOf(domain, worldKnights());

/**
 * @param {Actor} domain
 * @returns {Actor|null} The Knight whose arms it was set to show, if they're still about.
 */
function armsKnight(domain) {
	const knight = domain.system.armsKnight ? fromUuidSync(domain.system.armsKnight) : null;
	return knight?.documentName === "Actor" && knight.type === "knight" ? knight : null;
}

/**
 * What a Domain's sheet shows at its head, ready for the template.
 * @param {Actor} domain
 * @returns {{picture: string}|{heraldry: string, bearer: string, tooltip: string}}
 */
export function domainArmsView(domain) {
	const shown = domainArms({ arms: domain.system.arms, img: domain.img }, { ruler: domainRuler(domain), knight: armsKnight(domain) });
	if (shown.picture) return { ...shown, tooltip: t("domain.arms.picture.tooltip") };
	let tooltip = t("domain.arms.noRuler");
	if (shown.bearer) tooltip = t(shown.heraldry ? "domain.arms.of" : "domain.arms.unpainted", { name: shown.bearer });
	return { ...shown, tooltip };
}

/**
 * Ask what a Domain should show at the head of its sheet: its ruler's arms,
 * another Knight's, or a picture of the user's choosing.
 * @param {Actor} domain
 */
export async function chooseDomainArms(domain) {
	const ruler = domainRuler(domain);
	const others = worldKnights().filter((knight) => knight !== ruler).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
	const chosen = armsKnight(domain);
	const { arms } = domain.system;
	const data = await inputDialog({
		title: t("domain.arms.title", { name: domain.name }),
		icon: "fa-solid fa-shield-halved",
		template: "domain-arms",
		context: {
			arms: { ruler: arms === "ruler" || (arms === "knight" && !chosen), knight: arms === "knight" && Boolean(chosen), picture: arms === "picture" },
			rulerDetail: ruler ? t("domain.arms.ruler.detail", { name: ruler.name }) : t("domain.arms.ruler.none"),
			knights: others.map((knight) => ({ uuid: knight.uuid, name: knight.name, selected: knight === chosen, painted: Boolean(knight.system.heraldry) }))
		},
		ok: { label: t("domain.arms.ok"), icon: "fa-solid fa-check" },
		// Picking a Knight from the list means showing their arms.
		render: (_event, dialog) => {
			const radio = dialog.element.querySelector("input[name='arms'][value='knight']");
			dialog.element.querySelector("select[name='knight']")?.addEventListener("change", () => {
				if (radio) radio.checked = true;
			});
		}
	});
	if (!data) return;

	if (data.arms === "picture") {
		pickImageInto(domain, "img", "image", { "system.arms": "picture" });
		return;
	}
	if (data.arms === "knight" && data.knight) {
		await domain.update({ "system.arms": "knight", "system.armsKnight": data.knight });
		return;
	}
	await domain.update({ "system.arms": "ruler" });
}
