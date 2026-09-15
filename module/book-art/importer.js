import { confirmDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import {
	ART_ROOT,
	EXPECTED_PAGES,
	INDEX_FILE,
	KINDS,
	KIND_FOLDERS,
	PAGE_KINDS,
	SPARK_KIND,
	TEXT_REASONS,
	artDirectories,
	artFile,
	buildIndex,
	hasPageText,
	indexEntry,
	knightTextFromItems,
	mythTextFromItems,
	pickPageArt,
	seerNameFromItems,
	seerTextFromItems,
	spreads,
	titleFromItems,
	withArticle
} from "../rules/book-art.js";
import { REALM_SHEET_MAX_PAGES, looksLikeRealmSheet } from "../rules/realm-icons.js";
import { SPARK_PAGES, SPARK_TABLES_PER_PAGE, sparkTablesFromItems } from "../rules/spark-tables.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { ensureDirectories, uploadFile } from "./files.js";
import { imageFormat, listPageImages, openPdf, saveImage } from "./pdf.js";
import { importRealmIcons } from "./realm-import.js";
import { showImportReport } from "./report.js";

/** Stops a second import starting while one is under way. */
let running = false;

/**
 * Save every Knight's and Seer's portrait and every Myth's illustration from
 * the GM's own copy of the rulebook into ART_ROOT, with an index keyed by roll
 * that also holds the text read from each page. The Import Book Art macro runs this.
 * @returns {Promise<object|null>} The index, or null if nothing was imported.
 */
export async function importBookArt() {
	if (!game.ready) {
		ui.notifications.warn(t("bookArt.notReady"));
		return null;
	}
	if (running) {
		ui.notifications.warn(t("bookArt.running"));
		return null;
	}
	if (!game.user.can("FILES_UPLOAD")) {
		ui.notifications.error(t("bookArt.noPermission"));
		return null;
	}

	running = true;
	try {
		const file = await choosePdf();
		return file ? await importFrom(file) : null;
	} finally {
		running = false;
	}
}

/** @returns {Promise<File|null>} */
async function choosePdf() {
	// An element is used as-is, where string content would be run through
	// Foundry's HTML cleaning first.
	const content = document.createElement("div");
	content.innerHTML = await foundry.applications.handlebars.renderTemplate(templatePath("dialogs/book-art-import.hbs"), {
		pages: EXPECTED_PAGES,
		root: ART_ROOT
	});

	return foundry.applications.api.DialogV2.prompt({
		window: { title: t("bookArt.title"), icon: "fa-solid fa-book-open" },
		classes: ["bastionland-dialog"],
		content,
		ok: {
			label: t("bookArt.start"),
			icon: "fa-solid fa-file-import",
			callback: (_event, button) => {
				const [file] = button.form.elements.pdf.files;
				if (!file) ui.notifications.warn(t("bookArt.noFile"));
				return file ?? null;
			}
		},
		rejectClose: false
	});
}

/**
 * @param {File} file
 * @returns {Promise<object|null>}
 */
async function importFrom(file) {
	let opened;
	try {
		opened = await openPdf(file);
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't open ${file.name}`, error);
		ui.notifications.error(t("bookArt.unreadable", { name: file.name }));
		return null;
	}

	const { pdf, OPS } = opened;
	try {
		// The Blank Realm PDF is a few pages whose first carries the map legend's icons.
		if (pdf.numPages <= REALM_SHEET_MAX_PAGES) {
			const icons = await withPage(pdf, 1, async (page) => {
				const images = await listPageImages(page, OPS, { boxes: true });
				return looksLikeRealmSheet(images) ? importRealmIcons(pdf, page, images, file) : undefined;
			});
			if (icons !== undefined) return icons;
		}
		if (!(await looksLikeTheRulebook(pdf, OPS))) return null;
		return await extractArt(pdf, OPS);
	} finally {
		await pdf.destroy();
	}
}

/**
 * Load a page, read it, then free what pdf.js decoded for it.
 * @param {object} pdf
 * @param {number} number
 * @param {(page: object) => Promise<*>} read
 */
async function withPage(pdf, number, read) {
	const page = await pdf.getPage(number);
	try {
		return await read(page);
	} finally {
		page.cleanup();
	}
}

/**
 * Before writing anything, ask whether to go on with a PDF that doesn't match
 * the rulebook this import was made for: a different page count, or no art
 * where the first Knight and Myth should be.
 * @returns {Promise<boolean>} Whether to import.
 */
async function looksLikeTheRulebook(pdf, OPS) {
	if (pdf.numPages !== EXPECTED_PAGES) {
		const message = t("bookArt.pageMismatch", { pages: pdf.numPages, expected: EXPECTED_PAGES });
		if (!(await confirmMismatch(message))) return false;
	}

	const hasArt = async (role, number) => number <= pdf.numPages && withPage(pdf, number, async (page) =>
		!pickPageArt(role, await listPageImages(page, OPS)).problems.some(({ reason }) => reason === "notFound"));

	const [first] = spreads();
	const found = await Promise.all([hasArt("knight", first.knightPage), hasArt("myth", first.mythPage)]);
	if (found.every(Boolean)) return true;
	return confirmMismatch(t("bookArt.layoutMismatch"));
}

/**
 * @param {string} message
 * @returns {Promise<boolean>}
 */
const confirmMismatch = (message) => confirmDialog({ title: t("bookArt.mismatchTitle"), icon: "fa-solid fa-triangle-exclamation", message });

/**
 * Save the art from every spread, then the index.
 * @returns {Promise<object>} The index.
 */
async function extractArt(pdf, OPS) {
	const format = await imageFormat();
	await ensureDirectories(artDirectories());

	const pages = spreads().flatMap((spread) => [
		{ spread, role: "knight", number: spread.knightPage },
		{ spread, role: "myth", number: spread.mythPage }
	]);
	const last = pages.at(-1).number;
	const progress = ui.notifications.info(t("bookArt.progress", { page: pages[0].number, last }), { progress: true });

	const entries = [];
	const problems = [];
	for (const [done, { spread, role, number }] of pages.entries()) {
		progress.update({ pct: done / pages.length, message: t("bookArt.progress", { page: number, last }) });
		const result = await savePageArt(pdf, OPS, spread, role, number, format);
		entries.push(...result.entries);
		problems.push(...result.problems);
	}

	progress.update({ message: t("bookArt.readingSpark") });
	const spark = await readSparkTables(pdf, problems);

	progress.update({ message: t("bookArt.writingIndex") });
	const index = buildIndex({
		entries,
		problems,
		spark,
		pdfPages: pdf.numPages,
		importedAt: new Date().toISOString(),
		systemVersion: game.system.version
	});
	const indexPath = await uploadFile(ART_ROOT, new File([JSON.stringify(index, null, "\t")], INDEX_FILE, { type: "application/json" }));
	progress.update({ pct: 1 });

	await showReport(index, indexPath);
	return index;
}

/**
 * Read the text on one page, logging a page that can't be read.
 * @param {object} pdf
 * @param {number} number
 * @param {(items: object[]) => T} [parse] Given the page's text items.
 * @returns {Promise<T|null>} Null past the end of the PDF or on an error.
 * @template T
 */
async function readPageText(pdf, number, parse = (items) => items) {
	if (number > pdf.numPages) return null;
	try {
		return await withPage(pdf, number, async (page) => parse((await page.getTextContent()).items));
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't read page ${number}`, error);
		return null;
	}
}

/**
 * Save the art on one page of a spread and read its text. Every kind the page
 * should hold gets an entry, saved or not, so a roll always finds its line in
 * the index.
 * @returns {Promise<{entries: object[], problems: object[]}>}
 */
async function savePageArt(pdf, OPS, spread, role, number, format) {
	const { d6, d12, roll } = spread;
	const entries = [];
	const problems = [];
	const report = (kind, reason) => problems.push({ kind, roll, page: number, reason });

	try {
		await withPage(pdf, number, async (page) => {
			const [images, text] = await Promise.all([listPageImages(page, OPS), page.getTextContent()]);
			const { art, problems: found } = pickPageArt(role, images);
			for (const { kind, reason } of found) report(kind, reason);

			const title = titleFromItems(text.items);
			const names = { [role]: title && withArticle(title), seer: role === "knight" ? seerNameFromItems(text.items) : null };
			const pageText = role === "knight"
				? { knight: knightTextFromItems(text.items), seer: seerTextFromItems(text.items) }
				: { myth: mythTextFromItems(text.items) };

			for (const kind of PAGE_KINDS[role]) {
				const image = art[kind];
				const { dir, fileName, file } = artFile(kind, d6, d12, names[kind], format.extension);
				const saved = image ? await saveImage(page, image, { dir, fileName, format }) : {};
				if (saved.reason) report(kind, saved.reason);
				const entry = indexEntry({
					kind,
					d6,
					d12,
					page: number,
					name: names[kind],
					file,
					path: saved.path,
					width: image?.width,
					height: image?.height,
					text: pageText[kind]
				});
				if (!hasPageText(kind, entry)) report(kind, TEXT_REASONS[kind]);
				entries.push(entry);
			}
		});
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't read page ${number}`, error);
	}

	for (const kind of PAGE_KINDS[role]) {
		if (entries.some((entry) => entry.kind === kind)) continue;
		entries.push(indexEntry({ kind, d6, d12, page: number, file: artFile(kind, d6, d12, null, format.extension).file }));
		if (!problems.some((problem) => problem.kind === kind)) report(kind, "notFound");
	}
	return { entries, problems };
}

/**
 * Read each page of Spark Tables, reporting a page with none and any table
 * whose rows couldn't be read.
 * @param {object} pdf
 * @param {object[]} problems Added to.
 * @returns {Promise<object[]>} One entry per page that had tables.
 */
async function readSparkTables(pdf, problems) {
	const spark = [];
	for (const { key, page: number } of SPARK_PAGES) {
		const report = (roll, reason) => problems.push({ kind: SPARK_KIND, roll, page: number, reason });
		const read = await readPageText(pdf, number, sparkTablesFromItems);
		const name = read?.name || t(`spark.pages.${key}`);
		if (!read?.tables.length) {
			report(name, "sparkPage");
			continue;
		}
		for (const unread of read.unread) report(unread, "sparkText");
		spark.push({ key, page: number, name, tables: read.tables });
	}
	return spark;
}

/**
 * @param {object} index
 * @param {string|null} indexPath
 */
async function showReport(index, indexPath) {
	const label = (kind) => t(`bookArt.kinds.${kind}`);
	const listOf = (kind) => index[KIND_FOLDERS[kind]];
	const counts = [
		...KINDS.map((kind) => t("bookArt.report.saved", {
			kind: label(kind),
			saved: listOf(kind).filter((entry) => entry.path).length,
			total: listOf(kind).length
		})),
		...KINDS.map((kind) => t("bookArt.report.textRead", {
			kind: label(kind),
			read: listOf(kind).filter((entry) => hasPageText(kind, entry)).length,
			total: listOf(kind).length
		})),
		t("bookArt.report.sparkRead", {
			read: index.spark.reduce((count, page) => count + page.tables.length, 0),
			total: SPARK_PAGES.length * SPARK_TABLES_PER_PAGE
		})
	];
	const unnamed = KINDS.flatMap((kind) => listOf(kind)
		.filter((entry) => entry.path && !entry.name)
		.map((entry) => t("bookArt.report.unnamedEntry", { kind: label(kind), roll: entry.roll, page: entry.page })));
	const problems = index.problems.map((problem) => t("bookArt.report.problem", {
		kind: label(problem.kind),
		roll: problem.roll,
		page: problem.page,
		reason: t(`bookArt.report.reasons.${problem.reason}`)
	}));

	await showImportReport({ title: t("bookArt.report.title"), icon: "fa-solid fa-book-open", counts, indexPath, unnamed, problems });
}
