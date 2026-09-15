import { refreshRealmScenes } from "../actions/realm.js";
import { t } from "../chat/cards.js";
import { ART_ROOT } from "../rules/book-art.js";
import { TERRAIN } from "../rules/realm.js";
import {
	REALM_ICON_DIR,
	REALM_ICON_KINDS,
	REALM_INDEX_FILE,
	buildRealmIconIndex,
	classifyRealmIcons,
	realmIconFile,
	whiteToAlpha
} from "../rules/realm-icons.js";
import { ensureDirectories, uploadFile } from "./files.js";
import { imageFormat, saveImage } from "./pdf.js";
import { showImportReport } from "./report.js";

/**
 * Save the legend icons from the first page of the GM's own Blank Realm PDF
 * into REALM_ICON_DIR, with white made see-through, then write their index and
 * bring every Realm Scene's pictures up to date. Import Book Art hands the PDF
 * here when its first page is the Realm Sheet's legend.
 * @param {object} pdf      An open pdf.js document.
 * @param {object} page     Its first page, still loaded.
 * @param {object[]} images The page's pictures, with boxes.
 * @param {File} file       The PDF the GM chose.
 * @returns {Promise<object>} The icon index.
 */
export async function importRealmIcons(pdf, page, images, file) {
	const format = await imageFormat();
	await ensureDirectories([ART_ROOT, REALM_ICON_DIR]);

	const icons = classifyRealmIcons(images);
	const problems = [...icons.problems];
	const jobs = REALM_ICON_KINDS.flatMap((kind) => Object.entries(icons[kind]).map(([key, image]) => ({
		kind,
		key: kind === "terrain" ? Number(key) : key,
		image
	})));

	const progress = ui.notifications.info(t("bookArt.realm.progress"), { progress: true });
	const entries = [];
	for (const [done, { kind, key, image }] of jobs.entries()) {
		progress.update({ pct: done / jobs.length });
		const { fileName, file: relative } = realmIconFile(kind, key, format.extension);
		const saved = image ? await saveImage(page, image, { dir: REALM_ICON_DIR, fileName, format, transform: whiteToAlpha }) : {};
		if (saved.reason) problems.push({ kind, key: String(key), reason: saved.reason });
		entries.push({ kind, key, file: relative, path: saved.path ?? null, width: image?.width, height: image?.height });
	}

	progress.update({ message: t("bookArt.writingIndex") });
	const index = buildRealmIconIndex({
		entries,
		problems,
		importedAt: new Date().toISOString(),
		systemVersion: game.system.version,
		source: file.name,
		pdfPages: pdf.numPages
	});
	const indexPath = await uploadFile(REALM_ICON_DIR, new File([JSON.stringify(index, null, "\t")], REALM_INDEX_FILE, { type: "application/json" }));
	const refreshed = indexPath ? await refreshRealmScenes(index) : 0;
	progress.update({ pct: 1 });

	await showRealmReport(index, indexPath, refreshed);
	return index;
}

/**
 * @param {string} kind
 * @param {string} [key]
 * @returns {string} e.g. "Terrain: Forest".
 */
function iconLabel(kind, key) {
	const kindLabel = t(`bookArt.kinds.${kind}`);
	if (key === undefined) return kindLabel;
	const name = kind === "terrain" ? t(`realm.terrain.${TERRAIN[Number(key) - 1]}`)
		: kind === "holding" ? t(`realm.holdings.${key}`)
			: t(`realm.landmarks.${key}`);
	return `${kindLabel}: ${name}`;
}

/**
 * @param {object} index
 * @param {string|null} indexPath
 * @param {number} refreshed Realm Scenes whose pictures were updated.
 */
async function showRealmReport(index, indexPath, refreshed) {
	const lists = { terrain: index.terrain, holding: index.holdings, landmark: index.landmarks };
	const counts = [
		...REALM_ICON_KINDS.map((kind) => t("bookArt.report.saved", {
			kind: t(`bookArt.kinds.${kind}`),
			saved: lists[kind].filter((entry) => entry.path).length,
			total: lists[kind].length
		})),
		t("bookArt.realm.refreshed", { count: refreshed })
	];
	const problems = index.problems.map((problem) => t("bookArt.realm.problem", {
		icon: iconLabel(problem.kind, problem.key),
		reason: t(`bookArt.report.reasons.${problem.reason}`)
	}));

	await showImportReport({ title: t("bookArt.realm.reportTitle"), icon: "fa-solid fa-map", counts, indexPath, problems });
}
