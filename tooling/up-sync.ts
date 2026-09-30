// Copied from the Dizzy source by the sync. Change it there: an edit here is
// overwritten by the next sync.

// The up-sync (ADR 0125 §4, #2315): what the public translations repository
// sends back here after a merge there. Travels to that repository with the
// guards (the down-sync ships it) and runs there, in `.github/workflows/
// up-sync.yml`, over its own checkout and a sparse checkout of this one.
// Pure over the two directories, so a test runs it over temp dirs.
//
// It writes, into this repository's checkout:
//
// - every declared locale's namespace files, aligned to THIS repository's
//   en-GB key set (`mirror.ts`), so a translation merged against an English
//   catalogue one down-sync old still arrives passing the guards here;
// - `locales.json`, which is authored there;
// - each locale's `basis.json`: for every key whose translation this merge
//   changed, the en-GB string it was translated against (the public
//   repository's own copy, which is what the translator read). A key whose
//   translation did not change keeps its basis; a key emptied loses it;
// - the generated files that depend on a mirrored locale (the slices and
//   the loader's list of namespace files, and the phone's bundle list), so the pull request passes
//   `generate-messages --check` as it stands;
// - `.checksums.json`, recomputed, which is what lets `lint` here catch a
//   hand-edit of any of it.
//
// A named person squash-merges the pull request this becomes; that merge is
// the publish act, so nothing here ever merges anything.
//
// Usage: `bun up-sync.ts --from <public checkout> --to <site checkout>
//   [--prs "12 15"] [--repo owner/name] [--summary <file>]`.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import * as prettier from "prettier";
import {
  parseLocales,
  LOCALE_CODE,
} from "./catalogue/locales.schema";
import {
  isVariantLocale,
  SOURCE_LOCALE,
} from "./i18n/locales";
import {
  alignToSource,
  CATALOGUE_FILES_MARKER,
  BUNDLED_SLICES_FILE,
  bundledSlicesSource,
  catalogueFilesSource,
  checksums,
  namespaceFiles,
  orderChecksums,
  readNamespaceFiles,
  serialise,
  sliceOf,
  sourceByNamespace,
} from "./mirror.ts";

/** Where the catalogue and its generated neighbours sit in the site's checkout. */
const MESSAGES = join("packages", "domain", "messages");
const KEYS_FILE = join(
  "packages",
  "domain",
  "src",
  "i18n",
  "keys.generated.ts"
);

type Flat = Record<string, string>;

export type UpSyncResult = {
  locales: { locale: string; updated: string[]; cleared: string[] }[];
  manifest: boolean;
  changed: boolean;
};

const flat = (byNamespace: Record<string, Flat>): Flat =>
  Object.assign({}, ...Object.values(byNamespace)) as Flat;

function readText(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

export async function upSync(options: {
  from: string;
  to: string;
}): Promise<UpSyncResult> {
  const { from, to } = options;
  const messages = join(to, MESSAGES);
  let changed = false;

  async function format(path: string, content: string): Promise<string> {
    return prettier.format(content, {
      ...(await prettier.resolveConfig(path)),
      filepath: path,
    });
  }
  const put = (path: string, content: string) => {
    if (readText(path) === content) return false;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    changed = true;
    return true;
  };
  const drop = (path: string) => {
    if (!existsSync(path)) return;
    rmSync(path, { recursive: true });
    changed = true;
  };

  // The manifest: validated before anything is written, then taken as authored.
  const manifestPath = join(messages, "locales.json");
  const manifestText = readFileSync(join(from, "locales.json"), "utf8");
  const locales = parseLocales(JSON.parse(manifestText));
  const declared = Object.keys(locales);
  const manifest = put(manifestPath, await format(manifestPath, manifestText));

  const bySource = sourceByNamespace(join(messages, SOURCE_LOCALE));
  const english = flat(bySource);
  // The English the translator read: the public repository's copy, which can
  // be a down-sync behind this one.
  const theirEnglish = flat(sourceByNamespace(join(from, SOURCE_LOCALE)));

  const result: UpSyncResult["locales"] = [];
  for (const code of declared) {
    if (code === SOURCE_LOCALE) continue;
    const dir = join(messages, code);
    const incoming = readNamespaceFiles(join(from, code));
    if (incoming.unreadable.size > 0) {
      throw new Error(
        `${code}: ${[...incoming.unreadable].join(", ")} did not parse; the guards should have stopped this merge`
      );
    }
    const aligned = alignToSource(
      incoming.files,
      bySource,
      isVariantLocale(code)
    );
    const before = flat(sourceByNamespace(dir));
    for (const namespace of namespaceFiles(dir)) {
      if (!(namespace in aligned.files)) drop(join(dir, `${namespace}.json`));
    }
    for (const [namespace, content] of Object.entries(aligned.files)) {
      put(join(dir, `${namespace}.json`), serialise(content));
    }

    const after = flat(aligned.files);
    const basisPath = join(dir, "basis.json");
    const oldBasis = JSON.parse(readText(basisPath) ?? "{}") as Flat;
    const basis: Flat = {};
    const updated: string[] = [];
    const cleared: string[] = [];
    for (const key of Object.keys(after).sort()) {
      const value = after[key]!;
      if (value === "") {
        if ((before[key] ?? "") !== "") cleared.push(key);
        continue;
      }
      if (before[key] === value) {
        if (key in oldBasis) basis[key] = oldBasis[key]!;
        continue;
      }
      updated.push(key);
      const against = theirEnglish[key] ?? english[key];
      if (against !== undefined) basis[key] = against;
    }
    if (Object.keys(basis).length > 0) put(basisPath, serialise(basis));
    else drop(basisPath);
    if (updated.length + cleared.length > 0)
      result.push({ locale: code, updated, cleared });
  }

  // A locale the manifest no longer declares leaves the mirror.
  for (const entry of readdirSync(messages, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      LOCALE_CODE.test(entry.name) &&
      entry.name !== SOURCE_LOCALE &&
      !declared.includes(entry.name)
    ) {
      drop(join(messages, entry.name));
    }
  }

  // The slices: the same keys as the source locale's, which the generator
  // chose from the call sites; only the values move.
  for (const sub of ["slices", join("slices", "web")]) {
    const dir = join(messages, sub);
    const keys = Object.keys(
      JSON.parse(
        readFileSync(join(dir, `${SOURCE_LOCALE}.json`), "utf8")
      ) as Flat
    );
    for (const name of readdirSync(dir)) {
      if (
        name.endsWith(".json") &&
        !declared.includes(name.replace(/\.json$/, ""))
      )
        drop(join(dir, name));
    }
    for (const code of declared) {
      const path = join(dir, `${code}.json`);
      const catalogue = flat(sourceByNamespace(join(messages, code)));
      put(
        path,
        await format(path, JSON.stringify(sliceOf(catalogue, keys), null, 2))
      );
    }
  }

  // The loader's list of namespace files, the one line of the key union's
  // file that a mirrored locale moves.
  const keysPath = join(to, KEYS_FILE);
  const keysText = readFileSync(keysPath, "utf8");
  const at = keysText.indexOf(CATALOGUE_FILES_MARKER);
  if (at === -1) throw new Error(`${KEYS_FILE} has no CATALOGUE_FILES block`);
  const filesByLocale = new Map(
    [...declared]
      .sort()
      .map((code) => [code, namespaceFiles(join(messages, code))] as const)
  );
  put(
    keysPath,
    await format(
      keysPath,
      keysText.slice(0, at) + catalogueFilesSource(filesByLocale)
    )
  );

  // The phone's bundle list, which a locale flipped selectable moves.
  const bundledPath = join(to, BUNDLED_SLICES_FILE);
  put(bundledPath, await format(bundledPath, bundledSlicesSource(locales)));

  const checksumsPath = join(messages, ".checksums.json");
  put(
    checksumsPath,
    await format(
      checksumsPath,
      JSON.stringify(orderChecksums(checksums(messages, declared)), null, 2)
    )
  );

  return { locales: result, manifest, changed };
}

// --- the pull request's body ---

/** The marker the site's publish workflow reads to thank each contributor once this merges. */
export const PRS_MARKER = "translations-prs";

export function renderSummary(
  result: UpSyncResult,
  prs: readonly number[],
  repo: string
): string {
  const lines = [
    "Translations merged in the public repository. Merging this publishes them on the site.",
    "",
  ];
  const count = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  for (const locale of result.locales) {
    const parts = [
      `${count(locale.updated.length, "string", "strings")} translated or changed`,
    ];
    if (locale.cleared.length > 0)
      parts.push(
        `${count(locale.cleared.length, "string", "strings")} cleared`
      );
    lines.push(`- **${locale.locale}:** ${parts.join(", ")}.`);
  }
  if (result.manifest) lines.push("- The list of languages changed.");
  if (prs.length > 0) {
    lines.push("", `From ${prs.map((n) => `${repo}#${n}`).join(", ")}.`);
  }
  lines.push("", `<!-- ${PRS_MARKER}: ${prs.join(" ")} -->`);
  return `${lines.join("\n")}\n`;
}

// --- the command ---

if (import.meta.main) {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : args[at + 1];
  };
  const from = option("--from");
  const to = option("--to");
  if (from === undefined || to === undefined) {
    console.error(
      "up-sync: --from <public checkout> and --to <site checkout> are required"
    );
    process.exit(1);
  }
  const result = await upSync({ from: resolve(from), to: resolve(to) });
  const prs = [
    ...new Set(
      (option("--prs") ?? "")
        .split(/[\s,]+/)
        .filter((n) => /^\d+$/.test(n))
        .map(Number)
    ),
  ].sort((a, b) => a - b);
  const summary = option("--summary");
  if (summary !== undefined)
    writeFileSync(
      summary,
      renderSummary(
        result,
        prs,
        option("--repo") ?? "hyhydev/dizzy-translations"
      )
    );
  console.log(
    result.changed
      ? "up-sync: wrote the site's checkout"
      : "up-sync: nothing to change"
  );
}
