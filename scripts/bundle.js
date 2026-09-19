/**
 * The release bundle: every ES module the system loads, rolled into `dist/mythic-bastionland.js`.
 *
 * Why a release runs from one file. Foundry serves each file with `Cache-Control: no-cache`, so a
 * player's browser asks the server about every one of our modules on every load, and over HTTP/1.1
 * it can ask only six at a time. Foundry's own low-priority scripts queue behind them, and the whole
 * boot waits on those. One file is one request. The Stonetop system made the same change.
 *
 * A checkout still runs the unbundled source: `system.json` names `mythic-bastionland.js`, and only
 * release.yml points the SHIPPED manifest at the bundle. Day-to-day development needs no build.
 *
 * Three settings here are load-bearing, and tests/build/bundle.test.js holds each one:
 *
 *   keepNames   Foundry builds AppV1 hook names and stored sheet ids (`flags.core.sheetClass`) out
 *               of class names, and bundling renames any top-level name two modules happen to
 *               share. keepNames restores the original `.name`.
 *   splitting   Off, so the system starts on one request. Without it, a module reached only through
 *               `import()` is still evaluated lazily, on first use.
 *   warnings    Treated as errors, so anything esbuild is unsure about stops a release rather than
 *               shipping in it.
 */
import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The entry a checkout loads, as system.json names it. */
export const BUNDLE_ENTRY = "mythic-bastionland.js";

/** The file release.yml points the shipped manifest at. */
export const BUNDLE_OUTFILE = "dist/mythic-bastionland.js";

export const BUNDLE_OPTIONS = Object.freeze({
	absWorkingDir: ROOT,
	entryPoints: [BUNDLE_ENTRY],
	outfile: BUNDLE_OUTFILE,
	bundle: true,
	splitting: false,
	format: "esm",
	platform: "browser",
	// Foundry v14 runs in current Chromium and Electron, so nothing needs lowering, and nothing
	// lowered is nothing that can behave differently from the source.
	target: "esnext",
	keepNames: true,
	minify: false,
	charset: "utf8",
	// Linked, without the sources inlined: the zip ships module/ beside the bundle, so the map points
	// a browser at the real files rather than carrying a second copy of every one.
	sourcemap: "linked",
	sourcesContent: false,
	metafile: true,
	logLevel: "silent"
});

/**
 * Build the bundle. `write: false` holds the output in memory, which is how the tests build it.
 * @param {{write?: boolean}} [options]
 */
export async function buildBundle({ write = true } = {}) {
	const result = await esbuild.build({ ...BUNDLE_OPTIONS, write });
	if (result.warnings.length) {
		const text = await esbuild.formatMessages(result.warnings, { kind: "warning" });
		throw new Error(`The bundle has ${result.warnings.length} warning(s), and a release treats each one as an error:\n${text.join("\n")}`);
	}
	return result;
}
