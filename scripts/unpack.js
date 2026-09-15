/**
 * Write each compendium back out to JSON in packs/src/<name>, to keep changes
 * made inside Foundry. Entries whose only changes are timestamps are left as
 * they are. Run with Foundry closed or at the Setup screen.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractPack } from "@foundryvtt/foundryvtt-cli";

const root = join(import.meta.dirname, "..");
const { packs = [] } = JSON.parse(readFileSync(join(root, "system.json"), "utf8"));

/** Name source files after their entries, such as import-book-art.json. */
const fileName = (entry) => `${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}.json`;

for (const pack of packs) {
	await extractPack(join(root, pack.path), join(root, "packs/src", pack.name), {
		log: true,
		omitVolatile: true,
		transformName: fileName
	});
}

process.exit(0);
