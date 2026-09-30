// Copied from the Dizzy source by the sync. Change it there: an edit here is
// overwritten by the next sync.

// A locale's catalogue as the tooling reads it off disk: one parsed JSON
// value per namespace file, untyped because the guards are what prove the
// shape. Shared by the guards and the coverage report so the two agree on
// what "the keys of a locale" means.

import { NAMESPACES } from "../i18n/catalogue";

/** Parsed `<locale>/<namespace>.json`, keyed by namespace, exactly as read. */
export type CatalogueFiles = Readonly<Record<string, unknown>>;

/** A flat key-to-message map, the shape the runtime and the reports speak. */
export type Catalogue = Readonly<Record<string, string>>;

/** A parsed JSON object that is a plain map, so an array or null is not one. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The string-valued entries of every namespace file, flattened. Anything that
 * is not a string is dropped here and reported by the shape guard; a report
 * built over a malformed file still counts what it can.
 */
export function flattenFiles(files: CatalogueFiles): Catalogue {
  const out: Record<string, string> = {};
  for (const namespace of NAMESPACES) {
    const raw = files[namespace];
    if (!isRecord(raw)) continue;
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "string") out[key] = value;
    }
  }
  return out;
}
