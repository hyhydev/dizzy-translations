// Copied from the Dizzy source by the sync. Change it there: an edit here is
// overwritten by the next sync.

// Reads a catalogue directory (packages/domain/messages/ here, the
// repository root there) into the parsed-JSON shape the guards and the
// coverage report take. Nothing is validated beyond "is it JSON": the guards
// are the validation, and they report by file and key, so this reader's only
// job is to hand them everything and say which files could not be read.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NAMESPACES } from "./i18n/catalogue";
import type { CatalogueFiles } from "./catalogue/files";
import { LOCALE_CODE } from "./catalogue/locales.schema";

export type MessagesDir = {
  /** Parsed `locales.json`, or undefined when missing. */
  manifest: unknown;
  files: Record<string, CatalogueFiles>;
  /** Parsed `index.json`, or undefined when missing. */
  index: unknown;
  bases: Record<string, unknown>;
  /**
   * Parsed `glossary/<name>.json`, keyed by file name without `.json`, or
   * undefined when there is no glossary directory at all.
   */
  glossaries: Record<string, unknown> | undefined;
  /** Files that exist but could not be parsed, as `path: reason`. */
  errors: string[];
};

export function readMessagesDir(dir: string): MessagesDir {
  const errors: string[] = [];
  const json = (path: string): unknown => {
    const abs = join(dir, path);
    if (!existsSync(abs)) return undefined;
    try {
      return JSON.parse(readFileSync(abs, "utf8"));
    } catch {
      errors.push(`${path}: not valid JSON`);
      return undefined;
    }
  };

  const manifest = json("locales.json");
  if (
    manifest === undefined &&
    !errors.some((e) => e.startsWith("locales.json"))
  )
    errors.push("locales.json is missing");
  const index = json("index.json");

  const files: Record<string, CatalogueFiles> = {};
  const bases: Record<string, unknown> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !LOCALE_CODE.test(entry.name)) continue;
    const locale = entry.name;
    const mine: Record<string, unknown> = {};
    for (const namespace of NAMESPACES) {
      const value = json(`${locale}/${namespace}.json`);
      if (value !== undefined) mine[namespace] = value;
    }
    files[locale] = mine;
    const basis = json(`${locale}/basis.json`);
    if (basis !== undefined) bases[locale] = basis;
  }

  let glossaries: Record<string, unknown> | undefined;
  const glossaryDir = join(dir, "glossary");
  if (existsSync(glossaryDir)) {
    glossaries = {};
    for (const name of readdirSync(glossaryDir).sort()) {
      if (!name.endsWith(".json")) continue;
      const value = json(`glossary/${name}`);
      if (value !== undefined)
        glossaries[name.slice(0, -".json".length)] = value;
    }
  }

  return { manifest, files, index, bases, glossaries, errors };
}

/** The catalogue this repository holds, for a run with no directory argument. */
export const DEFAULT_MESSAGES_DIR = join(
  import.meta.dir,
  "..",
  "..",
  "packages",
  "domain",
  "messages"
);
