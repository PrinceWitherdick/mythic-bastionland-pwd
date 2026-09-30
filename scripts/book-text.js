/**
 * Tools for the book's own words, which the system never ships: it knows each
 * passage only by its page and a fingerprint (module/rules/book-text.js), and
 * reads the words from the GM's PDF. Each command takes your copy of the
 * rulebook, which is read here and never copied into the repository.
 *
 *   node scripts/book-text.js check <book.pdf> [--show]
 *     Find every passage in module/rules/book-prints.js, listing any that
 *     aren't found. --show prints what was found.
 *
 *   node scripts/book-text.js print <book.pdf> <page> "<words as printed>"
 *     The fingerprint for one passage, to add to module/rules/book-prints.js
 *     by hand, once it's been found on that page.
 *
 *   node scripts/book-text.js build <book.pdf> <spec.json>
 *     Write module/rules/book-prints.js from a spec kept outside the
 *     repository, of `{ "key": [page, "span", [page, "span"], ...] }`.
 *
 *   node scripts/book-text.js overlap <book.pdf> [<more.pdf> ...] [--words 6]
 *     Every run of that many words or more the repository shares with the
 *     PDFs, such as the free Blank Realm and character sheets as well as the
 *     book, other than bare stat lines and the few runs in ALLOWED. It exits
 *     with an error while any is left.
 *
 * pdf.js isn't a dependency. Point --pdfjs, or the PDFJS environment variable,
 * at Foundry's own copy, such as
 * "<Foundry>/resources/app/node_modules/@foundryvtt/pdfjs/build/pdf.mjs",
 * or install pdfjs-dist where Node can find it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BOOK_PRINTS, bookTextPages, findBookText, fingerprint, fingerprintLetters, pageRaw } from "../module/rules/book-text.js";

const root = join(import.meta.dirname, "..");
const PRINTS_FILE = join(root, "module/rules/book-prints.js");

/** @returns {{positional: string[], options: Record<string, string|boolean>}} */
function parseArgs(argv) {
	const positional = [];
	const options = {};
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (!arg.startsWith("--")) positional.push(arg);
		else if (["--show"].includes(arg)) options[arg.slice(2)] = true;
		else options[arg.slice(2)] = argv[++index];
	}
	return { positional, options };
}

/** @returns {Promise<object>} pdf.js. */
async function loadPdfjs(given) {
	const path = given ?? process.env.PDFJS;
	try {
		return await import(path ? pathToFileURL(resolve(path)).href : "pdfjs-dist/legacy/build/pdf.mjs");
	} catch (error) {
		console.error("Couldn't load pdf.js. Pass --pdfjs <Foundry>/resources/app/node_modules/@foundryvtt/pdfjs/build/pdf.mjs, or set PDFJS.");
		throw error;
	}
}

/**
 * Every page's text items, read once.
 * @returns {Promise<(page: number) => object[]|null>}
 */
async function openBook(pdfjs, file, pages) {
	const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, isEvalSupported: false }).promise;
	const items = new Map();
	for (const number of pages ?? Array.from({ length: pdf.numPages }, (_, index) => index + 1)) {
		if (number < 1 || number > pdf.numPages) continue;
		items.set(number, (await (await pdf.getPage(number)).getTextContent()).items);
	}
	await pdf.destroy();
	return (page) => items.get(page) ?? null;
}

/** The generated file, prints sorted by key within the spec's order of areas. */
function printsSource(prints) {
	const lines = Object.entries(prints).map(([key, [page, ...spans]]) => `\t${JSON.stringify(key)}: ${JSON.stringify([page, ...spans])}`);
	const head = readFileSync(PRINTS_FILE, "utf8").split("export const BOOK_PRINTS")[0];
	return `${head}export const BOOK_PRINTS = Object.freeze({\n${lines.join(",\n")}\n});\n`;
}

async function check(pdfjs, [file], { show }) {
	const itemsOf = await openBook(pdfjs, file, bookTextPages());
	const { texts, missing } = findBookText(itemsOf);
	console.log(`${Object.keys(texts).length} of ${Object.keys(BOOK_PRINTS).length} passages found.`);
	for (const key of missing) console.log(`  not found: ${key}`);
	if (show) for (const [key, text] of Object.entries(texts)) console.log(`${key}\n  ${text}`);
	return missing.length ? 1 : 0;
}

async function print(pdfjs, [file, page, words]) {
	const number = Number(page);
	const span = fingerprint(words);
	const itemsOf = await openBook(pdfjs, file, [number - 1, number, number + 1]);
	const { texts } = findBookText(itemsOf, { passage: [number, span] });
	if (!texts.passage) {
		console.error(`Not found on p${number}. Copy the words as the page prints them.`);
		return 1;
	}
	console.log(JSON.stringify([number, span]));
	return 0;
}

async function build(pdfjs, [file, specFile]) {
	const spec = JSON.parse(readFileSync(specFile, "utf8"));
	const prints = {};
	for (const [key, [page, ...spans]] of Object.entries(spec)) {
		prints[key] = [page, ...spans.map((span) => {
			const [own, words] = Array.isArray(span) ? span : [null, span];
			return own ? [...fingerprint(words), own] : fingerprint(words);
		})];
	}
	const itemsOf = await openBook(pdfjs, file, bookTextPages(prints));
	const { texts, missing } = findBookText(itemsOf, prints);
	let failed = missing.length > 0;
	for (const key of missing) console.error(`not found: ${key}`);
	// What's found has to be the spec's own words, not a longer run that happens to share its letters.
	for (const [key, text] of Object.entries(texts)) {
		const wanted = spec[key].slice(1).map((span) => (Array.isArray(span) ? span[1] : span)).join(" ");
		if (fingerprintLetters(text).text.replaceAll(".", "") !== fingerprintLetters(wanted).text.replaceAll(".", "")) {
			console.error(`read differently: ${key}\n  ${text}`);
			failed = true;
		}
	}
	if (failed) return 1;
	writeFileSync(PRINTS_FILE, printsSource(prints));
	console.log(`Wrote ${Object.keys(prints).length} passages to ${PRINTS_FILE}.`);
	return 0;
}

/** Lower-case words, as the overlap is counted in. */
const words = (text) => text.toLowerCase().replace(/[’‘']/g, "").match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * Words a stat line is made of: numbers, dice, Virtues, GD and Armour, and a
 * weapon's qualities. The book prints hundreds of stat lines, so a run of
 * these alone is bound to match one somewhere, and says nothing in the book's
 * words. A run is only reported with at least CONTENT_WORDS other words in it.
 */
const STAT_WORD = /^(?:\d+|\d*d\d+|\d*gd|a\d+|vig|cla|spi|gd|hefty|long|slow|blast|trample|ranged)$/;

const CONTENT_WORDS = 4;

/**
 * Runs checked and let stand, each a run of words that may be shared: the Scar
 * table's d6 of places a Scar lands, which the Scar roll names, and phrases
 * common enough in English that sharing them says nothing.
 */
const ALLOWED = Object.freeze([
	"1 eye 2 cheek 3 neck 4 torso 5 nose 6 jaw",
	"1 nose 2 ear 3 finger 4 thumb 5 eye 6 chunk of scalp",
	"for the rest of the day",
	"at the start of the next season"
]);

/**
 * The set phrases a Knight's Property line is written in, which the parsers
 * (module/rules/property.js, knight-tables.js) read and their tests have to
 * write out. Like a stat line's words, they don't count toward a run.
 */
const FORMAT_PHRASES = Object.freeze([
	"see below",
	"restock each new season",
	"one dose each day",
	"each when wielded as a pair",
	"hefty if mounted",
	"when mounted",
	"slow on foot",
	"long on foot"
]);

/** @returns {boolean} Whether a shared run is worth reporting. */
function reported(run) {
	if (ALLOWED.some((allowed) => ` ${allowed} `.includes(` ${run.join(" ")} `))) return false;
	let text = ` ${run.join(" ")} `;
	for (const phrase of FORMAT_PHRASES) text = text.replaceAll(` ${phrase} `, " ");
	return text.trim().split(/\s+/).filter((word) => word && !STAT_WORD.test(word)).length >= CONTENT_WORDS;
}

async function overlap(pdfjs, files, { words: size = 6 }) {
	const length = Number(size);
	const shared = new Set();
	for (const file of files) {
		const itemsOf = await openBook(pdfjs, file);
		for (let page = 1; itemsOf(page); page++) {
			const list = words(pageRaw(itemsOf(page)));
			for (let index = 0; index + length <= list.length; index++) shared.add(list.slice(index, index + length).join(" "));
		}
	}

	const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split("\n");
	const text = tracked.filter((path) => /\.(js|mjs|hbs|json|md|css|txt|py|yml)$/.test(path) && !path.startsWith("packs/") || path.startsWith("packs/src/"));
	let runs = 0;
	for (const path of text) {
		let source;
		try {
			source = readFileSync(join(root, path), "utf8");
		} catch {
			continue;
		}
		const list = [];
		source.split("\n").forEach((line, at) => {
			for (const word of words(line)) list.push({ word, line: at + 1 });
		});
		for (let index = 0; index + length <= list.length;) {
			if (!shared.has(list.slice(index, index + length).map(({ word }) => word).join(" "))) {
				index++;
				continue;
			}
			let end = index + length;
			while (end < list.length && shared.has(list.slice(end - length + 1, end + 1).map(({ word }) => word).join(" "))) end++;
			const run = list.slice(index, end).map(({ word }) => word);
			if (reported(run)) {
				console.log(`${path}:${list[index].line}  ${end - index} words  ${run.join(" ").slice(0, 100)}`);
				runs++;
			}
			index = end;
		}
	}
	console.log(`${runs} runs of ${length} or more words shared with the PDFs.`);
	return runs ? 1 : 0;
}

const COMMANDS = { check, print, build, overlap };
const [command, ...rest] = process.argv.slice(2);
const { positional, options } = parseArgs(rest);
if (!COMMANDS[command] || !positional.length) {
	console.error("Usage: node scripts/book-text.js check|print|build|overlap <book.pdf> ... (see the top of this file)");
	process.exit(2);
}
process.exit(await COMMANDS[command](await loadPdfjs(options.pdfjs), positional, options));
