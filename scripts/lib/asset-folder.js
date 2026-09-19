/**
 * The end of a script that writes a folder of pictures with their credits,
 * such as scripts/heraldry-charges.js and scripts/goods-icons.js.
 */
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Stop the script if anything failed, before anything is removed.
 * @param {string[]} failures One line for each.
 * @param {string} what What failed, in the plural, such as "charges".
 */
export function stopIfFailed(failures, what) {
	if (!failures.length) return;
	console.error(`\n${failures.length} ${what} failed, and nothing was removed:\n${failures.join("\n")}`);
	process.exit(1);
}

/**
 * Write the credits, and remove every file the script didn't write this time.
 * Files only: some drives refuse to remove folders.
 * @param {string} out The folder.
 * @param {Set<string>} written The names of the files written, the credits' included.
 * @param {string} creditsFile
 * @param {string} credits
 * @returns {number} How many old files were removed.
 */
export function finishFolder(out, written, creditsFile, credits) {
	writeFileSync(join(out, creditsFile), credits);
	const stale = readdirSync(out, { withFileTypes: true }).filter((entry) => entry.isFile() && !written.has(entry.name));
	for (const entry of stale) rmSync(join(out, entry.name));
	return stale.length;
}
