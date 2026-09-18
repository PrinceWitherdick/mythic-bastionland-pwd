import { confirmDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import {
	ART_ROOT,
	CITY_QUEST_KIND,
	EXPECTED_PAGES,
	INDEX_FILE,
	KINDS,
	KIND_FOLDERS,
	PAGE_KINDS,
	RULES_KIND,
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
	tokenFile,
	withArticle
} from "../rules/book-art.js";
import { tokenCrop } from "../rules/knight-tokens.js";
import {
	GOODS_KIND,
	GOODS_KIND_PAGES,
	GOODS_KINDS,
	GOODS_PAGES,
	RARITIES,
	goodsDocuments,
	goodsFromPages
} from "../rules/arms-and-goods.js";
import { CITY_OMEN_COUNT, CITY_QUEST_PAGES, cityQuestCastFromItems, cityQuestOmensFromItems } from "../rules/city-quest.js";
import { RULE_PAGES, rulePageFromItems } from "../rules/rule-pages.js";
import { SPARK_PAGES, SPARK_TABLES_PER_PAGE, sparkTablesFromItems } from "../rules/spark-tables.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { ART_INDEX_HOOK } from "./art-index.js";
import { ensureDirectories, uploadFile } from "./files.js";
import { GOODS_PACKS, copyGoodsToWorld } from "./goods-folders.js";
import { imageFormat, listPageImages, openPdf, saveImages } from "./pdf.js";
import { showImportReport } from "./report.js";
import { useSquareTokens } from "./square-tokens.js";

/** Stops a second import starting while one is under way. */
let running = false;

/**
 * Save every Knight's and Seer's portrait and every Myth's illustration from
 * the GM's own copy of the rulebook into ART_ROOT, with an index keyed by roll
 * that also holds the text read from each page. The Import PDF macro runs this.
 * @param {File} [given] The rulebook, when the caller already has it, as the
 *   Welcome does. Without one the GM is asked to choose it.
 * @returns {Promise<object|null>} The index, or null if nothing was imported.
 */
export async function importBookArt(given) {
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
		// A macro may pass anything, so only a real file skips the question.
		const file = given instanceof File ? given : await choosePdf();
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

	progress.update({ message: t("bookArt.readingCityQuest") });
	const cityQuest = await readCityQuest(pdf, problems);

	progress.update({ message: t("bookArt.readingRules") });
	const rules = await readRulePages(pdf, problems);

	progress.update({ message: t("bookArt.readingGoods") });
	const goods = await readGoods(pdf, problems);

	progress.update({ message: t("bookArt.writingIndex") });
	const index = buildIndex({
		entries,
		problems,
		spark,
		cityQuest,
		rules,
		pdfPages: pdf.numPages,
		importedAt: new Date().toISOString(),
		systemVersion: game.system.version
	});
	const indexPath = await uploadFile(ART_ROOT, new File([JSON.stringify(index, null, "\t")], INDEX_FILE, { type: "application/json" }));
	if (indexPath) Hooks.callAll(ART_INDEX_HOOK);

	progress.update({ message: t("bookArt.fillingGoods") });
	const goodsLines = [];
	if (!game.user.isGM) goodsLines.push(t("bookArt.report.goodsNotGM"));
	else {
		try {
			goodsLines.push(t("bookArt.report.goods", await fillGoodsPacks(goods)));
			try {
				goodsLines.push(t("bookArt.report.goodsFolders", await copyGoodsToWorld()));
			} catch (error) {
				console.error(`${SYSTEM_ID} | Couldn't copy Arms & Goods into the world`, error);
				goodsLines.push(t("bookArt.report.goodsFoldersFailed"));
			}
		} catch (error) {
			console.error(`${SYSTEM_ID} | Couldn't fill the Arms & Goods compendiums`, error);
			goodsLines.push(t("bookArt.report.goodsFailed"));
		}
	}
	let tokensLine = null;
	if (game.user.isGM) {
		try {
			const changed = await useSquareTokens(index);
			if (changed.actors || changed.tokens) tokensLine = t("bookArt.report.knightTokens", changed);
		} catch (error) {
			console.error(`${SYSTEM_ID} | Couldn't give existing Knights their square tokens`, error);
			tokensLine = t("bookArt.report.knightTokensFailed");
		}
	}
	progress.update({ pct: 1 });

	await showReport(index, indexPath, [...goodsLines, tokensLine]);
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
 * Read Warfare, Arms & Goods and People & Realms, reporting any kind of thing
 * none of which could be read.
 * @param {object} pdf
 * @param {object[]} problems Added to.
 * @returns {Promise<Record<string, object[]>>} From goodsFromPages.
 */
async function readGoods(pdf, problems) {
	const pages = [];
	for (const number of GOODS_PAGES) {
		const items = await readPageText(pdf, number);
		if (items) pages.push(items);
	}
	const goods = goodsFromPages(pages);
	for (const kind of GOODS_KINDS) {
		if (!goods[kind].length) problems.push({ kind: GOODS_KIND, roll: t(`goods.folders.${kind}`), page: GOODS_KIND_PAGES[kind], reason: "goodsKind" });
	}
	return goods;
}

/**
 * Put everything read from Arms & Goods into two world compendiums, one of
 * items and one of NPCs, each kind in its own folder. Running the import again
 * replaces what an earlier import put there. GMs only.
 * @param {Record<string, object[]>} goods
 * @returns {Promise<{items: number, actors: number, itemsPack: string, actorsPack: string}>}
 */
async function fillGoodsPacks(goods) {
	const documents = goodsDocuments(goods, {
		rarities: Object.fromEntries(RARITIES.map((key) => [key, t(`goods.rarities.${key}`)])),
		siege: t("goods.siege"),
		poison: (rarity) => t("goods.poison", { rarity: rarity ? t(`goods.rarities.${rarity}`) : "" }).trim(),
		rollVirtues: t("goods.rollVirtues"),
		attack: t("attack.title")
	});
	const labels = Object.fromEntries(Object.entries(GOODS_PACKS).map(([group, { label }]) => [group, t(label)]));

	const counts = {};
	for (const [group, { name, type, kinds }] of Object.entries(GOODS_PACKS)) {
		const folders = kinds.map((kind) => ({ name: t(`goods.folders.${kind}`), documents: documents[group][kind] }));
		await fillPack({ name, type, label: labels[group] }, folders);
		counts[group] = folders.reduce((count, folder) => count + folder.documents.length, 0);
	}
	return { ...counts, itemsPack: labels.items, actorsPack: labels.actors };
}

/**
 * Empty a world compendium, creating it first if needed, then fill it folder by folder.
 * @param {{name: string, type: string, label: string}} metadata
 * @param {{name: string, documents: object[]}[]} folders
 */
async function fillPack({ name, type, label }, folders) {
	const { CompendiumCollection } = foundry.documents.collections;
	const pack = game.packs.get(`world.${name}`) ?? await CompendiumCollection.createCompendium({ name, label, type });
	const operation = { pack: pack.collection };
	const documentClass = foundry.utils.getDocumentClass(type);
	const folderClass = foundry.utils.getDocumentClass("Folder");

	const index = await pack.getIndex();
	if (index.size) await documentClass.deleteDocuments(index.map((entry) => entry._id), operation);
	const oldFolders = pack.folders.map((folder) => folder.id);
	if (oldFolders.length) await folderClass.deleteDocuments(oldFolders, operation);

	const filled = folders.map((folder, index) => ({ ...folder, sort: (index + 1) * 100 })).filter((folder) => folder.documents.length);
	if (!filled.length) return;
	const created = await folderClass.createDocuments(filled.map((folder) => ({ name: folder.name, type, sort: folder.sort })), operation);
	await documentClass.createDocuments(filled.flatMap((folder, index) => folder.documents.map((data) => ({ ...data, folder: created[index].id }))), operation);
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
				// A Knight's token is cut from their portrait, decoded once for both.
				const targets = [{ dir, fileName }];
				if (image && kind === "knight") targets.push({ ...tokenFile(d6, d12, names[kind], format.extension), crop: tokenCrop(image, roll) });
				const [saved = {}, token = {}] = image ? await saveImages(page, image, targets, { format }) : [];
				if (saved.reason) report(kind, saved.reason);
				if (token.reason) report(kind, token.reason);
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
					token: token.path,
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
 * Read the City Quest's Omens and Cast, reporting either part that couldn't be read.
 * @param {object} pdf
 * @param {object[]} problems Added to.
 * @returns {Promise<{omens: string[]|null, cast: object[]|null, castNote: string}>}
 */
async function readCityQuest(pdf, problems) {
	const read = async (part, parse) => {
		const number = CITY_QUEST_PAGES[part];
		const result = await readPageText(pdf, number, parse);
		if (!result) problems.push({ kind: CITY_QUEST_KIND, roll: t(`bookArt.cityQuestParts.${part}`), page: number, reason: "cityQuestText" });
		return result;
	};

	const omens = await read("omens", cityQuestOmensFromItems);
	const cast = await read("cast", cityQuestCastFromItems);
	return { omens, cast: cast?.cast ?? null, castNote: cast?.castNote ?? "" };
}

/**
 * Read each rules page, reporting one whose sections couldn't be read.
 * @param {object} pdf
 * @param {object[]} problems Added to.
 * @returns {Promise<Record<string, {page: number, sections: object[]}>>} By each page's key in RULE_PAGES.
 */
async function readRulePages(pdf, problems) {
	const rules = {};
	for (const [key, page] of Object.entries(RULE_PAGES)) {
		const sections = await readPageText(pdf, page, rulePageFromItems);
		if (sections) rules[key] = { page, sections };
		else problems.push({ kind: RULES_KIND, roll: t(`bookArt.rulePages.${key}`), page, reason: "rulesText" });
	}
	return rules;
}

/**
 * @param {object} index
 * @param {string|null} indexPath
 * @param {string[]} [goodsLines] What became of Arms & Goods.
 */
async function showReport(index, indexPath, goodsLines = []) {
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
		}),
		t("bookArt.report.cityQuestRead", {
			omens: index.cityQuest?.omens?.length ?? 0,
			total: CITY_OMEN_COUNT,
			cast: index.cityQuest?.cast?.length ?? 0
		}),
		t("bookArt.report.rulesRead", {
			read: Object.keys(index.rules ?? {}).length,
			total: Object.keys(RULE_PAGES).length
		}),
		...goodsLines
	].filter(Boolean);
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
