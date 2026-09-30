// Copied from the Dizzy source by the sync. Change it there: an edit here is
// overwritten by the next sync.

// The coverage report's entry point (ADR 0125 §4, #2114, #2304): read a
// catalogue directory and print packages/domain/messages/coverage.ts's
// Markdown, for a pull-request comment. With `--base <dir>` (the same
// catalogue before the change, a checkout of the base ref), every number
// carries the delta the change causes. A report and never a gate: the exit
// code says only whether the directory could be read.
//
// Usage: `bun scripts/translations/coverage.ts [dir] [--base <dir>]`.

import { parseLocales } from "./catalogue/locales.schema";
import {
  coverage,
  type CoverageInput,
  renderCoverage,
} from "./catalogue/coverage";
import {
  type Catalogue,
  flattenFiles,
  isRecord,
} from "./catalogue/files";
import type { Basis } from "./catalogue/basis";
import { SOURCE_LOCALE } from "./i18n/locales";
import { DEFAULT_MESSAGES_DIR, readMessagesDir } from "./read.ts";

const args = process.argv.slice(2);
const baseAt = args.indexOf("--base");
const base = baseAt === -1 ? undefined : args[baseAt + 1];
const dir =
  args.find(
    (a, i) => !a.startsWith("--") && (baseAt === -1 || i !== baseAt + 1)
  ) ?? DEFAULT_MESSAGES_DIR;

function input(at: string): CoverageInput {
  const read = readMessagesDir(at);
  if (read.errors.length > 0) {
    console.error(`coverage: could not read ${at}`);
    for (const error of read.errors) console.error(`  ${error}`);
    process.exit(1);
  }
  const catalogues: Record<string, Catalogue> = {};
  for (const [locale, files] of Object.entries(read.files)) {
    if (locale !== SOURCE_LOCALE) catalogues[locale] = flattenFiles(files);
  }
  const bases: Record<string, Basis> = {};
  for (const [locale, raw] of Object.entries(read.bases)) {
    if (!isRecord(raw)) continue;
    bases[locale] = Object.fromEntries(
      Object.entries(raw).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
  }
  const index = isRecord(read.index)
    ? (read.index as CoverageInput["index"])
    : {};
  return {
    manifest: parseLocales(read.manifest),
    source: flattenFiles(read.files[SOURCE_LOCALE] ?? {}),
    catalogues,
    bases,
    index,
  };
}

console.log(
  renderCoverage(
    coverage(input(dir)),
    base === undefined ? undefined : coverage(input(base))
  )
);
