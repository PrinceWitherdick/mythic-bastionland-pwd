import { t } from "../chat/cards.js";
import { templatePath } from "../system-id.js";

/**
 * Tell the GM what an import saved and what went wrong.
 * @param {object} report
 * @param {string} report.title
 * @param {string} report.icon       Font Awesome classes.
 * @param {string[]} report.counts
 * @param {string|null} report.indexPath
 * @param {string[]} [report.unnamed]
 * @param {string[]} report.problems
 */
export async function showImportReport({ title, icon, counts, indexPath, unnamed = [], problems }) {
	const content = await foundry.applications.handlebars.renderTemplate(templatePath("dialogs/book-art-report.hbs"), {
		counts,
		indexPath,
		unnamed,
		problems
	});
	await foundry.applications.api.DialogV2.prompt({
		window: { title, icon },
		classes: ["bastionland-dialog"],
		content,
		ok: { label: t("bookArt.report.close"), icon: "fa-solid fa-check" },
		rejectClose: false
	});
}
