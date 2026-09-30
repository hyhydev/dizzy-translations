// Copied from the Dizzy source by the sync. Change it there: an edit here is
// overwritten by the next sync.

// The translation guards' entry point (ADR 0125 §4, #2304): read a catalogue
// directory, run packages/domain/messages/guards.ts over it, print every
// problem by guard, file and key, and fail on any. Runs in `bun run lint`
// over packages/domain/messages/ and, carried by the down-sync, in the public
// translations repository's CI over its root, where a volunteer sees the
// failure on their own pull request. Same code, run twice: the checksum in
// `lint` proves the mirrored files did not change in transit, and this
// proves the bot wrote them well-formed.
//
// What travels with it (#2315): this directory, scripts/ai-signifiers.ts,
// scripts/copy-bans.ts, packages/domain/messages/*.ts and the two pure
// modules they import from packages/domain/src/i18n/ (catalogue.ts,
// locales.ts, and format.ts for a type). Nothing here imports `@/`, the app,
// the database or the network.
//
// The word-level bans are assembled here rather than in the guard, because
// their pattern lists live with check:copy: the AI-signifier list crosses the
// language boundary and runs over every locale; the em-dash, "Less" and
// "scene" bans are English register and run over en-GB and its variants only
// (a translation locale's "scene" is a glossary matter, ADR 0125 §4).
//
// Usage: `bun scripts/translations/check.ts [dir]`.

import { relative } from "node:path";
import { SIGNIFIERS } from "./ai-signifiers.ts";
import {
  EM_DASH,
  IDENTIFIER_CHUNK,
  LESS_LABEL_TEXT,
  SCENE_WORD,
} from "./copy-bans.ts";
import {
  checkCatalogues,
  type ProseBan,
} from "./catalogue/guards";
import { flattenFiles } from "./catalogue/files";
import { SOURCE_LOCALE } from "./i18n/locales";
import { DEFAULT_MESSAGES_DIR, readMessagesDir } from "./read.ts";

export const PROSE_BANS: ProseBan[] = [
  ...SIGNIFIERS.map(
    ({ pattern, label }): ProseBan => ({
      label,
      scope: "every-locale",
      test: (text) => pattern.test(text),
    })
  ),
  {
    label: "em-dash",
    scope: "english",
    test: (text) => text.includes(EM_DASH),
  },
  {
    label: '"Less" as a label for countable things',
    scope: "english",
    test: (text) => LESS_LABEL_TEXT.test(text),
  },
  {
    label: '"scene"',
    scope: "english",
    test: (text) => SCENE_WORD.test(text) && !IDENTIFIER_CHUNK.test(text),
  },
];

const dir =
  process.argv.slice(2).find((a) => !a.startsWith("--")) ??
  DEFAULT_MESSAGES_DIR;
const read = readMessagesDir(dir);

if (read.errors.length > 0) {
  console.error(
    `translation guards FAILED: could not read ${relative(process.cwd(), dir) || "."}`
  );
  for (const error of read.errors) console.error(`  ${error}`);
  process.exit(1);
}

const problems = checkCatalogues({
  manifest: read.manifest,
  files: read.files,
  index: read.index,
  bases: read.bases,
  glossaries: read.glossaries,
  prose: PROSE_BANS,
});

if (problems.length > 0) {
  console.error(
    `translation guards FAILED: ${problems.length} ${problems.length === 1 ? "problem" : "problems"}. ` +
      `These are about the shape of each line (curly braces, tags, links, length), never about your choice of words.`
  );
  for (const p of problems) {
    const where = [p.locale, p.file].filter(Boolean).join("/");
    console.error(
      `  [${p.guard}] ${where || "-"} ${p.key ?? "-"}: ${p.message}`
    );
  }
  process.exit(1);
}

const keys = Object.keys(flattenFiles(read.files[SOURCE_LOCALE] ?? {})).length;
const locales = Object.keys(read.files).length;
console.log(
  `translation guards passed (${keys} ${keys === 1 ? "key" : "keys"}, ${locales} ${locales === 1 ? "locale" : "locales"})`
);
