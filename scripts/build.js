// `npm run build`: write the release bundle to dist/. See scripts/bundle.js for why it exists.
import { buildBundle, BUNDLE_OUTFILE } from "./bundle.js";

const started = Date.now();
try {
	const result = await buildBundle();
	const bytes = result.metafile.outputs[BUNDLE_OUTFILE].bytes;
	const modules = Object.keys(result.metafile.inputs).length;
	console.log(`Bundled ${modules} modules into ${BUNDLE_OUTFILE} (${Math.round(bytes / 1024)} KB) in ${Date.now() - started} ms.`);
} catch (err) {
	console.error(err.message);
	process.exit(1);
}
