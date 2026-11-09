import { confirmDialog, promptDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import {
	ART_ROOT,
	BOOK_TEXT_KIND,
	CITY_QUEST_KIND,
	EXPECTED_PAGES,
	INDEX_FILE,
	INDEX_VERSION,
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
import { BOOK_PRINTS } from "../rules/book-text.js";
import { RULE_PAGES, rulePageFromItems } from "../rules/rule-pages.js";
import { SPARK_PAGES, SPARK_TABLES_PER_PAGE, sparkTablesFromItems } from "../rules/spark-tables.js";
import { setImportedVersion } from "../rulebook/store.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { markSetupDone } from "../world-setup.js";
import { artIndexWritten, loadArtIndex } from "./art-index.js";
import { BOOK_TEXT_TOTAL, readBookText } from "./book-text.js";
import { ensureDirectories, filePicker, uploadFile } from "./files.js";
import { GOODS_PACKS, copyGoodsToWorld } from "./goods-folders.js";
import { NPC_PACK, NPC_PACK_STEP, fillNpcPack } from "./npc-pack.js";
import { fillPack } from "./packs.js";
import { imageFormat, listPageImages, openPdf, saveImages, withPage } from "./pdf.js";
import { showImportReport } from "./report.js";
import { useSquareTokens } from "./square-tokens.js";

/**
 * The last INDEX_VERSION whose pictures differ from an earlier import's: 6 cut each Knight's square token.
 * Read again after an update, an index this new keeps the pictures it saved and only the text is read anew.
 * Raise it to INDEX_VERSION when a change alters the pictures themselves, such as how a token is cropped.
 */
const ART_VERSION = 6;

/** Stops a second import starting while one is under way. */
let running = false;

/**
 * Save every Knight's and Seer's portrait and every Myth's illustration from
 * the GM's own copy of the rulebook into ART_ROOT, with an index keyed by roll
 * that also holds the text read from each page. The Import PDF macro runs this.
 * @param {File} [given] The rulebook, when the caller already has it, as
 *   bringInRulebook does. Without one the GM is asked to choose it.
 * @param {object} [options]
 * @param {boolean} [options.again] Read again by the system after an update, not by the GM: Arms & Goods
 *   aren't copied into the world, so folders the GM deleted stay deleted.
 * @returns {Promise<object|null>} The index, or null if nothing was imported.
 */
export async function importBookArt(given, { again = false } = {}) {
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
		const file = given instanceof File ? given : await chooseRulebookPdf();
		return file ? await importFrom(file, { again }) : null;
	} finally {
		running = false;
	}
}

/**
 * Ask the GM for their PDF, in the dialog that says what's read from it.
 * @returns {Promise<File|null>}
 */
export async function chooseRulebookPdf() {
	// An element is used as-is, where string content would be run through
	// Foundry's HTML cleaning first.
	const content = document.createElement("div");
	content.innerHTML = await foundry.applications.handlebars.renderTemplate(templatePath("dialogs/book-art-import.hbs"), {
		pages: EXPECTED_PAGES,
		root: ART_ROOT
	});

	return promptDialog({
		title: t("bookArt.title"),
		icon: "fa-solid fa-book-open",
		content,
		ok: {
			label: t("bookArt.start"),
			icon: "fa-solid fa-file-import",
			callback: (_event, button) => {
				const [file] = button.form.elements.pdf.files;
				if (!file) ui.notifications.warn(t("bookArt.noFile"));
				return file ?? null;
			}
		}
	});
}

/**
 * @param {File} file
 * @param {{again: boolean}} options As importBookArt's.
 * @returns {Promise<object|null>}
 */
async function importFrom(file, options) {
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
		// Read again by the system, it's the book the Referee already took, and isn't asked about each load.
		if (!options.again && !(await looksLikeTheRulebook(pdf, OPS))) return null;
		return await extractArt(pdf, OPS, options);
	} finally {
		await pdf.destroy();
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
 * @param {object} pdf
 * @param {object} OPS
 * @param {{again: boolean}} options As importBookArt's.
 * @returns {Promise<object>} The index.
 */
async function extractArt(pdf, OPS, { again }) {
	const format = await imageFormat();
	await ensureDirectories(artDirectories());

	const pages = spreads().flatMap((spread) => [
		{ spread, role: "knight", number: spread.knightPage },
		{ spread, role: "myth", number: spread.mythPage }
	]);
	const last = pages.at(-1).number;
	const progress = ui.notifications.info(t("bookArt.progress", { page: pages[0].number, last }), { progress: true });

	const kept = again ? await keptPictures() : null;
	const entries = [];
	const problems = [];
	for (const [done, { spread, role, number }] of pages.entries()) {
		progress.update({ pct: done / pages.length, message: t("bookArt.progress", { page: number, last }) });
		const result = await savePageArt(pdf, OPS, spread, role, number, format, kept);
		entries.push(...result.entries);
		problems.push(...result.problems);
	}

	progress.update({ message: t("bookArt.readingSpark") });
	const spark = await readSparkTables(pdf, problems);

	progress.update({ message: t("bookArt.readingCityQuest") });
	const cityQuest = await readCityQuest(pdf, problems);

	progress.update({ message: t("bookArt.readingRules") });
	const rules = await readRulePages(pdf, problems);

	progress.update({ message: t("bookArt.readingBookText") });
	const bookText = await readRulesText(pdf, problems);

	progress.update({ message: t("bookArt.readingGoods") });
	const goods = await readGoods(pdf, problems);

	progress.update({ message: t("bookArt.writingIndex") });
	const index = buildIndex({
		entries,
		problems,
		spark,
		cityQuest,
		rules,
		bookText,
		pdfPages: pdf.numPages,
		importedAt: new Date().toISOString(),
		systemVersion: game.system.version
	});
	const indexPath = await uploadFile(ART_ROOT, new File([JSON.stringify(index, null, "\t")], INDEX_FILE, { type: "application/json" }));
	if (indexPath) await artIndexWritten();

	progress.update({ message: t("bookArt.fillingGoods") });
	const goodsLines = [];
	// A compendium left unfilled leaves the world behind, to be read again next load.
	let unfilled = false;
	if (!game.user.isGM) goodsLines.push(t("bookArt.report.goodsNotGM"));
	else {
		try {
			goodsLines.push(t("bookArt.report.goods", await fillGoodsPacks(goods)));
			if (!again) {
				try {
					goodsLines.push(t("bookArt.report.goodsFolders", await copyGoodsToWorld()));
				} catch (error) {
					console.error(`${SYSTEM_ID} | Couldn't copy Arms & Goods into the world`, error);
					goodsLines.push(t("bookArt.report.goodsFoldersFailed"));
				}
			}
		} catch (error) {
			console.error(`${SYSTEM_ID} | Couldn't fill the Arms & Goods compendiums`, error);
			goodsLines.push(t("bookArt.report.goodsFailed"));
			unfilled = true;
		}
		progress.update({ message: t("bookArt.fillingNpcs") });
		try {
			goodsLines.push(t("bookArt.report.npcs", { ...await fillNpcPack(index), pack: t(NPC_PACK.label) }));
			await markSetupDone(NPC_PACK_STEP);
		} catch (error) {
			console.error(`${SYSTEM_ID} | Couldn't fill the NPCs compendium`, error);
			goodsLines.push(t("bookArt.report.npcsFailed"));
			unfilled = true;
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
	// The world is up to date with this version's reading only once the index it reads is written.
	if (indexPath && game.user.isGM && !unfilled) await setImportedVersion(INDEX_VERSION);
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
 * @param {string} path
 * @returns {string} The path as the server lists it, however it was encoded.
 */
const plainPath = (path) => {
	try {
		return decodeURI(path);
	} catch {
		return path;
	}
};

/**
 * The pictures an earlier import saved that a reading after an update can keep:
 * its index, if it's no older than ART_VERSION, and the files still in the art folders.
 * @returns {Promise<{index: object, files: Set<string>}|null>} Null when every picture is saved anew.
 */
async function keptPictures() {
	const index = await loadArtIndex();
	if (!(index?.version >= ART_VERSION)) return null;
	try {
		const listed = await Promise.all(artDirectories().map((dir) => filePicker().browse("data", dir)));
		return { index, files: new Set(listed.flatMap((result) => result?.files ?? []).map(plainPath)) };
	} catch (error) {
		console.warn(`${SYSTEM_ID} | Couldn't list the saved book art, so it's saved again`, error);
		return null;
	}
}

/**
 * A picture the earlier import saved just as this one would: the same roll,
 * file name and size, and still on the server, with a Knight's token beside it.
 * @param {{index: object, files: Set<string>}|null} kept From keptPictures.
 * @returns {{path: string, token: string|null}|null}
 */
function keptPicture(kept, { kind, d6, d12, file, image, tokenName }) {
	if (!kept || !image) return null;
	const old = kept.index[KIND_FOLDERS[kind]]?.find((entry) => entry.d6 === d6 && entry.d12 === d12);
	const there = (path) => typeof path === "string" && kept.files.has(plainPath(path));
	if (!old || old.file !== file || old.width !== image.width || old.height !== image.height || !there(old.path)) return null;
	if (kind !== "knight") return { path: old.path, token: null };
	return there(old.token) && old.token.endsWith(`/${tokenName}`) ? { path: old.path, token: old.token } : null;
}

/**
 * Save the art on one page of a spread and read its text. Every kind the page
 * should hold gets an entry, saved or not, so a roll always finds its line in
 * the index. A picture an earlier import saved just the same is kept, not saved again.
 * @param {{index: object, files: Set<string>}|null} [kept] From keptPictures.
 * @returns {Promise<{entries: object[], problems: object[]}>}
 */
async function savePageArt(pdf, OPS, spread, role, number, format, kept = null) {
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
				const tokenTarget = kind === "knight" ? tokenFile(d6, d12, names[kind], format.extension) : null;
				const reused = keptPicture(kept, { kind, d6, d12, file, image, tokenName: tokenTarget?.fileName });
				const targets = [{ dir, fileName }];
				if (image && tokenTarget) targets.push({ ...tokenTarget, crop: tokenCrop(image, roll) });
				const [saved = {}, token = {}] = reused ? [{ path: reused.path }, { path: reused.token }] : image ? await saveImages(page, image, targets, { format }) : [];
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
 * Find the book's words for the rules text the system shows, reporting each
 * page with passages that couldn't be found there.
 * @param {object} pdf
 * @param {object[]} problems Added to.
 * @returns {Promise<Record<string, string>>} By language key.
 */
async function readRulesText(pdf, problems) {
	const { texts, missing } = await readBookText(pdf);
	const byPage = new Map();
	for (const key of missing) {
		const page = BOOK_PRINTS[key][0];
		byPage.set(page, (byPage.get(page) ?? 0) + 1);
	}
	for (const [page, count] of byPage) {
		problems.push({ kind: BOOK_TEXT_KIND, roll: t("bookArt.report.passageCount", { count }), page, reason: "bookText" });
	}
	return texts;
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
		t("bookArt.report.bookTextRead", {
			read: Object.keys(index.bookText ?? {}).length,
			total: BOOK_TEXT_TOTAL
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
