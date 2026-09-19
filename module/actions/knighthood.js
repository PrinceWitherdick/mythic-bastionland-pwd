import { wireGuideRail } from "../apps/guide-rail.js";
import { t } from "../chat/cards.js";
import { STARTS } from "../rules/creation.js";
import { RANKS } from "../rules/glory.js";
import { KNIGHTHOOD_SECTIONS, knighthoodSection } from "../rules/knighthood.js";
import { VIRTUES } from "../rules/virtues.js";
import { openRulebook } from "../rulebook/BookReader.js";
import { canReadRulebook, hasRulebook } from "../rulebook/store.js";
import { templatePath } from "../system-id.js";

/** Printed dice read the book's way: "1d12 + 1d6" becomes "d12+d6". */
const bookDice = (formula) => formula.replace(/\b1d/g, "d").replace(/\s+/g, "");

/** @type {foundry.applications.api.DialogV2|null} The page as last opened. */
let open = null;

/** The section last read, which the page opens at again. */
let lastSection = null;

/**
 * The Knighthood page (p7) with the Glory half of the page facing it (p6),
 * as a window to read beside the sheet. The Start a Knight was made from and
 * their present rank stand out.
 * @param {Actor} [actor] The Knight whose sheet asked.
 * @returns {Promise<foundry.applications.api.DialogV2>}
 */
export async function openKnighthood(actor) {
	// One copy of the page at a time: asking again replaces it where it stood, marked for this Knight.
	const position = open?.rendered ? { ...open.position } : { width: 680, height: 540 };
	if (open?.rendered) await open.close({ animate: false });
	const section = knighthoodSection(lastSection);
	const content = await foundry.applications.handlebars.renderTemplate(templatePath("dialogs/knighthood.hbs"), {
		sections: KNIGHTHOOD_SECTIONS.map(({ key, icon, label }) => ({ key, icon, label: t(label), active: key === section })),
		shown: { [section]: true },
		virtues: VIRTUES.map((key) => ({ label: t(`virtues.${key}.label`), hint: t(`virtues.${key}.hint`) })),
		starts: STARTS.map((start) => ({
			name: t(`company.starts.${start.key}.name`),
			hint: t(`company.starts.${start.key}.hint`),
			virtues: bookDice(start.virtues),
			guard: bookDice(start.guard)
		})),
		ranks: RANKS.map((rank) => ({
			glory: rank.glory,
			label: t(`rank.${rank.key}`),
			worthy: t(`rank.worthy.${rank.key}`),
			active: !actor?.system.isSquire && actor?.system.rank === rank.key
		}))
	});
	const buttons = [{ action: "close", icon: "fa-solid fa-check", label: t("knighthood.close"), default: true }];
	if (hasRulebook() && canReadRulebook()) buttons.unshift({
		action: "read",
		icon: "fa-solid fa-book-open",
		label: t("knighthood.readBook"),
		callback: () => openRulebook({ page: 6 })
	});
	const dialog = new foundry.applications.api.DialogV2({
		window: { title: t("knighthood.title"), icon: "fa-solid fa-chess-knight", resizable: true },
		classes: ["bastionland-dialog", "bastionland-guide-dialog", "bastionland-knighthood-dialog"],
		position,
		content,
		buttons
	});
	dialog.addEventListener("render", () => wireGuideRail(dialog.element, (key) => (lastSection = key)));
	open = dialog;
	return dialog.render({ force: true });
}
