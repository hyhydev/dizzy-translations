// Copied from the Dizzy source by the sync. Change it there: an edit here is
// overwritten by the next sync.

// What both syncs, and the generator here, do to a mirrored catalogue (ADR
// 0125 §4, #2315). One implementation of each rule, because the same file is
// written in three places and any two that disagree fail a checksum:
//
// - `alignToSource`: a translation locale mirrors the en-GB key set exactly,
//   untranslated keys present as `""`, and a variant carries only keys the
//   source still has. The down-sync runs it over the public repository (so a
//   new key appears there as `""`), `scripts/generate-messages.ts` runs it
//   here (so a code pull request that adds a key keeps the mirror passing the
//   guards until the round trip lands), and the up-sync runs it again (so a
//   translation merged against an older en-GB arrives aligned to this one).
//   All three write byte-identical files, so the round trip changes nothing.
// - `checksums`: one sha256 per mirrored file, what `.checksums.json` holds
//   and `lint` recomputes.
// - `sliceOf` and `catalogueFilesSource`: the two generated outputs that
//   depend on a translation locale's files, which the up-sync rewrites so its
//   pull request passes `generate-messages --check` as it stands.
//
// Pure over data plus node:fs and node:crypto, no Bun API and no formatter,
// so the domain suite imports it and the public repository runs it.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NAMESPACES } from "./i18n/catalogue";
import {
  fallbackChain,
  selectableLocales,
  SOURCE_LOCALE,
  type Locales,
} from "./i18n/locales";

type Flat = Record<string, string>;

/** A catalogue file as every sync writes it: two-space JSON and a final newline, the formatter's own output for a flat map. */
export function serialise(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export type Alignment = {
  /** Namespace to the file's new content, only for files that exist afterwards. */
  files: Record<string, Flat>;
  /** Keys given `""` because the source has them and the locale did not. */
  added: string[];
  /** Keys dropped because the source no longer has them. */
  removed: string[];
};

/**
 * A locale's namespace files aligned to the source's key set. A translation
 * locale gets every source namespace, every source key in source order, its
 * own value where it has a string and `""` where it has none. A variant keeps
 * only the files it has and only keys the source still has; it never gains a
 * key, since presence is what records a choice.
 */
export function alignToSource(
  files: Readonly<Record<string, unknown>>,
  source: Readonly<Record<string, Readonly<Flat>>>,
  variant: boolean,
  /** Namespaces whose file exists but does not parse: left alone, for the guards to report. */
  skip: ReadonlySet<string> = new Set()
): Alignment {
  const out: Record<string, Flat> = {};
  const added: string[] = [];
  const removed: string[] = [];
  for (const namespace of NAMESPACES) {
    if (skip.has(namespace)) continue;
    const raw = files[namespace];
    const mine: Record<string, unknown> =
      raw !== null && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const theirs = source[namespace] ?? {};
    for (const key of Object.keys(mine)) {
      if (!(key in theirs)) removed.push(key);
    }
    if (variant) {
      if (raw === undefined) continue;
      const kept: Flat = {};
      for (const key of Object.keys(mine).sort()) {
        const value = mine[key];
        if (key in theirs && typeof value === "string") kept[key] = value;
      }
      out[namespace] = kept;
      continue;
    }
    if (Object.keys(theirs).length === 0 && raw === undefined) continue;
    const aligned: Flat = {};
    for (const key of Object.keys(theirs).sort()) {
      const value = mine[key];
      if (typeof value === "string") aligned[key] = value;
      else {
        aligned[key] = "";
        if (!(key in mine)) added.push(key);
      }
    }
    out[namespace] = aligned;
  }
  return { files: out, added: added.sort(), removed: removed.sort() };
}

/**
 * One sha256 per `.json` file in each listed locale's directory, keyed
 * `<locale>/<file>`: what `.checksums.json` records. The source locale is
 * never mirrored, so it is never listed.
 */
export function checksums(
  messagesDir: string,
  locales: readonly string[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const code of [...locales].sort()) {
    if (code === SOURCE_LOCALE) continue;
    const dir = join(messagesDir, code);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith(".json")) continue;
      out[`${code}/${name}`] = sha256(readFileSync(join(dir, name)));
    }
  }
  return out;
}

/** Checksum entries in the order `checksums` writes them: by locale, then file. */
export function orderChecksums(
  entries: Readonly<Record<string, string>>
): Record<string, string> {
  const split = (name: string) => {
    const at = name.indexOf("/");
    return [name.slice(0, at), name.slice(at + 1)] as const;
  };
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return Object.fromEntries(
    Object.entries(entries).sort(([a], [b]) => {
      const [ca, fa] = split(a);
      const [cb, fb] = split(b);
      return cmp(ca, cb) || cmp(fa, fb);
    })
  );
}

export function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

/** The entries of `catalogue` whose keys are in `keys`, in `keys` order. */
export function sliceOf(
  catalogue: Readonly<Flat>,
  keys: readonly string[]
): Flat {
  const slice: Flat = {};
  for (const key of keys) if (key in catalogue) slice[key] = catalogue[key]!;
  return slice;
}

/** The marker the `CATALOGUE_FILES` block starts at, so the up-sync can replace it alone. */
export const CATALOGUE_FILES_MARKER =
  "/** The namespace files each declared locale actually has, so a loader imports only what exists. */";

/**
 * The tail of `keys.generated.ts`: which namespace files each declared locale
 * has, before formatting. The generator ends the file with it; the up-sync
 * replaces it when a locale gains or loses a file.
 */
export function catalogueFilesSource(
  filesByLocale: ReadonlyMap<string, readonly string[]>
): string {
  const codes = [...filesByLocale.keys()].sort();
  return `${CATALOGUE_FILES_MARKER}
export const CATALOGUE_FILES: Readonly<Record<string, readonly string[]>> = {
${codes.map((code) => `  ${JSON.stringify(code)}: ${JSON.stringify(filesByLocale.get(code))},`).join("\n")}
};
`;
}

/** The namespaces a locale directory has a file for, in catalogue order. */
export function namespaceFiles(dir: string): string[] {
  return NAMESPACES.filter((namespace) =>
    existsSync(join(dir, `${namespace}.json`))
  );
}

/**
 * Each namespace file in a locale directory, parsed, and the ones that do not
 * parse, which alignment must leave alone rather than overwrite with blanks.
 */
export function readNamespaceFiles(dir: string): {
  files: Record<string, unknown>;
  unreadable: Set<string>;
} {
  const files: Record<string, unknown> = {};
  const unreadable = new Set<string>();
  for (const namespace of namespaceFiles(dir)) {
    try {
      files[namespace] = JSON.parse(
        readFileSync(join(dir, `${namespace}.json`), "utf8")
      );
    } catch {
      unreadable.add(namespace);
    }
  }
  return { files, unreadable };
}

/** The source locale's files as flat string maps by namespace, what alignment aligns to. */
export function sourceByNamespace(dir: string): Record<string, Flat> {
  const out: Record<string, Flat> = {};
  for (const [namespace, raw] of Object.entries(
    readNamespaceFiles(dir).files
  )) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const flat: Flat = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string") flat[key] = value;
    }
    out[namespace] = flat;
  }
  return out;
}

/** Where the phone's bundle list lives, from the repository root. */
export const BUNDLED_SLICES_FILE = join(
  "packages",
  "domain",
  "src",
  "i18n",
  "bundled-slices.generated.ts"
);

/**
 * The phone's bundle list (ADR 0125 §7), before formatting: a static import
 * of the slice for every selectable locale and every locale on its chain,
 * because Metro resolves only a literal specifier. Flipping a locale
 * selectable changes it, and that flip arrives by the up-sync, so both the
 * generator and the up-sync write it from here; it sits in the i18n folder
 * because that is what the up-sync's checkout of this repository holds.
 */
export function bundledSlicesSource(locales: Locales): string {
  const bundled = [
    ...new Set(
      selectableLocales(locales).flatMap((code) => fallbackChain(code, locales))
    ),
  ].sort();
  const name = (code: string) => `slice_${code.replace(/-/g, "_")}`;
  // Every specifier goes through JSON.stringify so this file holds no quoted
  // import of its own: the down-sync walks the tooling's imports by pattern,
  // and a literal `from "./messages"` here reads to it as one.
  return `// Generated by scripts/generate-messages.ts and the translations up-sync.
// Do not edit: \`bun scripts/generate-messages.ts\` rewrites it, and \`lint\`
// fails while it is stale. The slices the phone bundles, one per selectable
// locale and every locale on its fallback chain (ADR 0125 §7). Only
// apps/mobile imports it.

import type { Catalogue } from ${JSON.stringify("./messages")};
${bundled.map((code) => `import ${name(code)} from ${JSON.stringify(`../../messages/slices/${code}.json`)};`).join("\n")}

export const BUNDLED_SLICES: Readonly<Record<string, Catalogue>> = {
${bundled.map((code) => `  ${JSON.stringify(code)}: ${name(code)},`).join("\n")}
};
`;
}
