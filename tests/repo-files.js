import { join } from "node:path";

/** The system's folder in this repository. */
export const root = join(import.meta.dirname, "..");

/** Map a served system path (systems/<id>/...) back to the file in this repository. */
export const fileFor = (path) => join(root, path.replace(/^systems\/[^/]+\//, ""));
