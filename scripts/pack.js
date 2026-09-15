/**
 * Build each compendium declared in system.json from its JSON sources in
 * packs/src/<name>. Foundry locks a pack while a world is open, so run this
 * with Foundry closed or at the Setup screen.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compilePack } from "@foundryvtt/foundryvtt-cli";

const root = join(import.meta.dirname, "..");
const { packs = [] } = JSON.parse(readFileSync(join(root, "system.json"), "utf8"));

let failed = false;
for (const pack of packs) {
	try {
		await compilePack(join(root, "packs/src", pack.name), join(root, pack.path), { log: true });
	} catch (error) {
		// On Node 24 the database can close before an iterator does. Everything is written by then.
		if (error.code === "LEVEL_ITERATOR_NOT_OPEN") continue;
		failed = true;
		if ([error.code, error.cause?.code].includes("LEVEL_LOCKED")) {
			console.error(`${pack.path} is open in Foundry. Close the world or Foundry, then run npm run pack again.`);
		} else {
			console.error(error);
		}
	}
}

// Exit now rather than let the database teardown race finish the process.
process.exit(failed ? 1 : 0);
