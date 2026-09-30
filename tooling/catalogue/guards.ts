// Copied from the Dizzy source by the sync. Change it there: an edit here is
// overwritten by the next sync.

// The translation guards (ADR 0125 §4, #2304): everything that can be proved
// wrong about a catalogue from the catalogue alone. Pure over parsed JSON, so
// the same function runs in two places on the same files: this repository's
// `lint` (scripts/translations/check.ts) and the public translations
// repository's CI, where a volunteer sees the failure on their own pull
// request. No file system, no app, no network; the entry point does the
// reading. Structural, every one of them: none reads the words, because a
// guard that pretended to check meaning is how a bad string reaches a screen
// (the named person's merge is the defence for that, §4).
//
// Beside the five the ADR names and the manifest checks, a shape pass proves
// each file is flat, sorted, string-valued and in its namespace, because in
// the public repository nothing else would.
//
// Three readings this file makes of the ADR's wording, written down so they
// are not re-decided in review:
//
// - Placeholders, tags and URLs are each compared as the SET of what a
//   message uses, not a count of occurrences. A plural's branches are the
//   translator's to add (Polish needs `few` and `many`, Japanese keeps only
//   `other`), and every branch repeats whatever the sentence carries, so a
//   count would refuse exactly the edit the format exists for. A placeholder's
//   kind is part of its identity, because `{n}` and `{n, number}` render
//   differently (the latter groups thousands, §4). What a set cannot see, a
//   placeholder dropped from one branch while another still carries it, is
//   the reviewer's read. Inside a plural, `{count}` and `#` both stand for the
//   plural's own value, so neither counts as a separate placeholder.
// - A translation is compared against the English it was MADE against: its
//   `basis` where the up-sync recorded one, the current source otherwise.
//   When `en-GB` changes, every translation of that key is outdated (the
//   coverage report's bucket, §4) and must stay "present, valid, passing
//   every guard", or the down-sync that carries the new English would be
//   blocked by strings nobody has had the chance to update.
// - A variant locale (`en-US`, `isVariantLocale`) is an overlay (§2): only
//   keys the source has, none identical to it, none empty, since presence is
//   what records a choice. Being English, it gets the English-register bans
//   a translation does not. The source locale gets them too: its values sit
//   in JSON, where `check:copy`'s lexer never looks.

import { NAMESPACES, namespaceOf } from "../i18n/catalogue";
import type { RichTag } from "../i18n/format";
import { isVariantLocale, SOURCE_LOCALE } from "../i18n/locales";
import {
  type Catalogue,
  type CatalogueFiles,
  flattenFiles,
  isRecord,
} from "./files";
import { ICU, type IcuNode, parseMessage } from "./icu";
import { type Locales } from "../i18n/locales";
import { localesSchema } from "./locales.schema";
import { parseGlossary } from "./glossary.schema";

export type Guard =
  | "shape"
  | "manifest"
  | "icu"
  | "placeholders"
  | "tags"
  | "length"
  | "keys"
  | "prose"
  | "index";

export type Problem = {
  guard: Guard;
  locale?: string;
  /** The file the problem sits in: `common.json`, `locales.json`, `index.json`, `basis.json`, `glossary/fr.json`. */
  file?: string;
  key?: string;
  message: string;
};

/**
 * A word-level ban supplied by the caller, since the pattern lists live with
 * `check:copy`. `every-locale` bans cross the language boundary (an AI
 * signifier is wrong in any language); `english` bans are about English
 * register (the em-dash, "Less", "scene") and apply to the source locale and
 * its variants only.
 */
export type ProseBan = {
  label: string;
  scope: "every-locale" | "english";
  test: (text: string) => boolean;
};

export type GuardInput = {
  /** Parsed `locales.json`. */
  manifest: unknown;
  /** Each locale directory's namespace files, keyed by locale then namespace. */
  files: Readonly<Record<string, CatalogueFiles>>;
  /** Parsed `index.json`, or undefined when the file is missing. */
  index: unknown;
  /** Parsed `<locale>/basis.json` for each locale that has one. */
  bases?: Readonly<Record<string, unknown>>;
  /**
   * Parsed `glossary/<name>.json` for each file in the glossary directory,
   * keyed by file name without `.json`. Omitted, the glossary checks do not
   * run; present, `en-GB`'s is required.
   */
  glossaries?: Readonly<Record<string, unknown>>;
  prose?: readonly ProseBan[];
};

/** The closed set a rich message may use (ADR 0125 §4), mirrored from the formatter's type. */
const RICH_TAGS: ReadonlySet<string> = new Set<RichTag>(["b", "link", "code"]);

/**
 * The physical-class counts behind the `rtl` refusal, as counted for ADR
 * 0125 §4 in September 2026. A snapshot in a message, on purpose: the public
 * repository has no app to count, and the point is to say what kind of work
 * an RTL locale is, not to track it.
 */
const PHYSICAL_CLASSES = { spacing: 221, logicalSpacing: 3, textAlign: 145 };

const SELF_CLOSING_TAG = /<([A-Za-z][\w-]*)(?:\s[^<>]*)?\/>/g;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>"']+/g;

export function checkCatalogues(input: GuardInput): Problem[] {
  const problems: Problem[] = [];
  const manifest = localesSchema.safeParse(input.manifest);
  if (!manifest.success) {
    for (const issue of manifest.error.issues) {
      problems.push({
        guard: "manifest",
        file: "locales.json",
        message: `${issue.path.length > 0 ? `${issue.path.join(".")}: ` : ""}${issue.message}`,
      });
    }
    return sorted(problems);
  }
  const locales = manifest.data;
  const declared = Object.keys(locales).filter((code) => code in input.files);
  const catalogues = new Map(
    declared.map((code) => [code, flattenFiles(input.files[code]!)] as const)
  );
  const source: Catalogue = catalogues.get(SOURCE_LOCALE) ?? {};
  const bases = readBases(input.bases ?? {}, problems);

  checkManifest(locales, input.files, problems);
  if (input.glossaries !== undefined)
    checkGlossaries(locales, input.glossaries, problems);
  checkShape(declared, input.files, problems);
  const anatomies = analyseMessages(declared, catalogues, problems);
  compareToReference(declared, catalogues, source, bases, anatomies, problems);
  checkKeys(declared, input.files, catalogues, source, problems);
  checkProse(declared, catalogues, input.prose ?? [], problems);
  checkIndex(input.index, source, problems);
  return sorted(problems);
}

// --- the manifest ---

function checkManifest(
  locales: Locales,
  files: GuardInput["files"],
  problems: Problem[]
) {
  for (const [code, entry] of Object.entries(locales)) {
    if (entry.dir !== "rtl") continue;
    problems.push({
      guard: "manifest",
      locale: code,
      file: "locales.json",
      message:
        `dir "rtl" is refused until the layout uses logical properties: ` +
        `${PHYSICAL_CLASSES.spacing} physical spacing classes against ${PHYSICAL_CLASSES.logicalSpacing} logical, ` +
        `and ${PHYSICAL_CLASSES.textAlign} text-left/text-right against no text-start/text-end ` +
        `(as counted in September 2026). A right-to-left language needs the site's layout changed before it can be added`,
    });
  }
  for (const code of Object.keys(files)) {
    if (code in locales) continue;
    problems.push({
      guard: "manifest",
      locale: code,
      message: "has catalogue files but is not declared in locales.json",
    });
  }
}

// --- the glossaries, validated beside the manifest ---

/**
 * Each glossary file fits its schema and names a declared locale, and every
 * glossary defines every term `en-GB`'s does, so no language can skip a word
 * the English side lists (register first among them). Extra terms are the
 * locale's own business. The English glossary's `note` is each term's
 * definition, so there it must say something.
 */
function checkGlossaries(
  locales: Locales,
  glossaries: Readonly<Record<string, unknown>>,
  problems: Problem[]
) {
  const fileOf = (code: string) => `glossary/${code}.json`;
  const parsed = new Map<string, ReadonlySet<string>>();
  for (const [code, raw] of Object.entries(glossaries)) {
    const file = fileOf(code);
    if (!(code in locales)) {
      problems.push({
        guard: "manifest",
        locale: code,
        file,
        message:
          "is not named after a language in locales.json; a glossary file takes its language's code, like fr.json or pt-BR.json",
      });
      continue;
    }
    const result = parseGlossary(raw);
    if (!result.ok) {
      for (const issue of result.error.issues) {
        const [term, ...rest] = issue.path;
        problems.push({
          guard: "manifest",
          locale: code,
          file,
          ...(term !== undefined ? { key: String(term) } : {}),
          message: `${rest.length > 0 ? `${rest.join(".")}: ` : ""}${issue.message}`,
        });
      }
      continue;
    }
    parsed.set(code, new Set(Object.keys(result.terms)));
    if (code !== SOURCE_LOCALE) continue;
    for (const [term, entry] of Object.entries(result.terms)) {
      if ((entry.note ?? "").trim() !== "") continue;
      problems.push({
        guard: "manifest",
        locale: code,
        file,
        key: term,
        message:
          "the English glossary's note is the term's definition, so a translator knows what the thing is; write one",
      });
    }
  }

  const reference = parsed.get(SOURCE_LOCALE);
  if (reference === undefined) {
    if (!(SOURCE_LOCALE in glossaries)) {
      problems.push({
        guard: "manifest",
        locale: SOURCE_LOCALE,
        file: fileOf(SOURCE_LOCALE),
        message: "is missing; every other glossary is checked against it",
      });
    }
    return;
  }
  for (const [code, terms] of parsed) {
    if (code === SOURCE_LOCALE) continue;
    for (const term of reference) {
      if (terms.has(term)) continue;
      problems.push({
        guard: "manifest",
        locale: code,
        file: fileOf(code),
        key: term,
        message: `is not defined; every glossary defines every term ${fileOf(SOURCE_LOCALE)} does`,
      });
    }
  }
}

// --- shape: flat, sorted, string-valued, each key in its file ---

function checkShape(
  declared: string[],
  files: GuardInput["files"],
  problems: Problem[]
) {
  for (const code of declared) {
    for (const namespace of NAMESPACES) {
      const raw = files[code]![namespace];
      if (raw === undefined) continue;
      const file = `${namespace}.json`;
      if (!isRecord(raw)) {
        problems.push({
          guard: "shape",
          locale: code,
          file,
          message: "not an object",
        });
        continue;
      }
      const keys = Object.keys(raw);
      const inOrder = [...keys].sort();
      const outOfPlace = inOrder.find((key, i) => keys[i] !== key);
      if (outOfPlace !== undefined) {
        problems.push({
          guard: "shape",
          locale: code,
          file,
          key: outOfPlace,
          message: "keys are not sorted (first out of place)",
        });
      }
      for (const [key, value] of Object.entries(raw)) {
        if (typeof value !== "string") {
          problems.push({
            guard: "shape",
            locale: code,
            file,
            key,
            message: "not a string",
          });
        }
        const home = namespaceOf(key);
        if (home !== namespace) {
          problems.push({
            guard: "shape",
            locale: code,
            file,
            key,
            message:
              home === null
                ? "no namespace claims it; the first segment names the file"
                : `belongs in ${home}.json`,
          });
        }
      }
    }
  }
}

/** Each locale's basis as a map of strings, with anything else reported. */
function readBases(
  raw: Readonly<Record<string, unknown>>,
  problems: Problem[]
): Map<string, Catalogue> {
  const bases = new Map<string, Catalogue>();
  for (const [code, value] of Object.entries(raw)) {
    if (!isRecord(value)) {
      problems.push({
        guard: "shape",
        locale: code,
        file: "basis.json",
        message: "not an object",
      });
      continue;
    }
    const basis: Record<string, string> = {};
    for (const [key, english] of Object.entries(value)) {
      if (typeof english === "string") basis[key] = english;
      else
        problems.push({
          guard: "shape",
          locale: code,
          file: "basis.json",
          key,
          message: "not a string",
        });
    }
    bases.set(code, basis);
  }
  return bases;
}

// --- ICU: every non-empty value parses within the permitted list ---

/** What a message is made of, for the comparisons against its reference. */
type Anatomy = {
  /** `{name}` or `{name, kind}`, one per distinct placeholder, sorted. */
  placeholders: string[];
  /** Distinct tag names, sorted. */
  tags: string[];
  /** Distinct URLs, sorted. */
  urls: string[];
};

type Where = { locale: string; file: string; key: string };

const fileOf = (key: string) => `${namespaceOf(key) ?? "?"}.json`;

/**
 * Parse one message and report what is wrong with it on its own: a parse
 * failure, a banned argument type, a tag outside the closed set, a
 * self-closing tag. Returns its anatomy, or undefined when it did not parse.
 */
function analyse(
  value: string,
  at: Where | undefined,
  problems: Problem[]
): Anatomy | undefined {
  const report = (guard: Guard, message: string) => {
    if (at !== undefined) problems.push({ guard, ...at, message });
  };
  for (const match of value.matchAll(SELF_CLOSING_TAG)) {
    report(
      "tags",
      `<${match[1]}/> won't work. Tags come in pairs, like <b>this</b>, just as they do in the English`
    );
  }
  let ast: IcuNode[];
  try {
    ast = parseMessage(value);
  } catch (error) {
    report(
      "icu",
      `does not parse: the curly braces or tags don't add up. Check every { has a matching } (${error instanceof Error ? error.message : String(error)})`
    );
    return undefined;
  }
  const placeholders = new Set<string>();
  const tags = new Set<string>();
  // The plurals the cursor is inside, by argument name: within one, `{count}`
  // and `#` are the plural's own value.
  const plurals: string[] = [];
  const walk = (nodes: IcuNode[]) => {
    for (const node of nodes) {
      const own = node.value !== undefined && plurals.includes(node.value);
      switch (node.type) {
        case ICU.argument:
          if (!own) placeholders.add(`{${node.value}}`);
          break;
        case ICU.number:
          if (!own) placeholders.add(`{${node.value}, number}`);
          if (node.style !== null && node.style !== undefined) {
            report(
              "icu",
              `write {${node.value}, number} with nothing after the word number. The site formats numbers and money itself`
            );
          }
          break;
        case ICU.date:
        case ICU.time: {
          const kind = node.type === ICU.date ? "date" : "time";
          report(
            "icu",
            `{${node.value}, ${kind}} can't be used here. The site writes out ${kind}s itself, in each reader's own time zone`
          );
          break;
        }
        case ICU.select:
          placeholders.add(`{${node.value}, select}`);
          break;
        case ICU.plural:
          placeholders.add(
            `{${node.value}, ${node.pluralType === "ordinal" ? "selectordinal" : "plural"}}`
          );
          break;
        case ICU.tag:
          tags.add(node.value ?? "");
          if (!RICH_TAGS.has(node.value ?? "")) {
            report(
              "tags",
              `<${node.value}> isn't allowed. Only ${[...RICH_TAGS].map((t) => `<${t}>`).join(", ")} can be used, and only where the English has them`
            );
          }
          break;
      }
      if (node.options) {
        if (node.type === ICU.plural) plurals.push(node.value ?? "");
        for (const option of Object.values(node.options)) walk(option.value);
        if (node.type === ICU.plural) plurals.pop();
      }
      if (node.children) walk(node.children);
    }
  };
  walk(ast);
  return {
    placeholders: [...placeholders].sort(),
    tags: [...tags].sort(),
    urls: [...new Set([...value.matchAll(URL)].map((m) => m[0]))].sort(),
  };
}

function analyseMessages(
  declared: string[],
  catalogues: Map<string, Catalogue>,
  problems: Problem[]
): Map<string, Map<string, Anatomy>> {
  const anatomies = new Map<string, Map<string, Anatomy>>();
  for (const code of declared) {
    const mine = new Map<string, Anatomy>();
    anatomies.set(code, mine);
    for (const [key, value] of Object.entries(catalogues.get(code)!)) {
      if (value === "") continue;
      const anatomy = analyse(
        value,
        { locale: code, file: fileOf(key), key },
        problems
      );
      if (anatomy !== undefined) mine.set(key, anatomy);
    }
  }
  return anatomies;
}

// --- against the reference: placeholders, tags, URLs, length ---

function compareToReference(
  declared: string[],
  catalogues: Map<string, Catalogue>,
  source: Catalogue,
  bases: Map<string, Catalogue>,
  anatomies: Map<string, Map<string, Anatomy>>,
  problems: Problem[]
) {
  const sourceAnatomy =
    anatomies.get(SOURCE_LOCALE) ?? new Map<string, Anatomy>();
  // A basis text's own faults were the source's when it was current and are
  // not reported again; only its anatomy is wanted, memoised per text.
  const basisAnatomy = new Map<string, Anatomy | undefined>();
  const anatomyOf = (english: string, key: string): Anatomy | undefined => {
    if (english === source[key]) return sourceAnatomy.get(key);
    if (!basisAnatomy.has(english))
      basisAnatomy.set(english, analyse(english, undefined, []));
    return basisAnatomy.get(english);
  };

  for (const code of declared) {
    if (code === SOURCE_LOCALE) continue;
    const basis = bases.get(code) ?? {};
    for (const [key, value] of Object.entries(catalogues.get(code)!)) {
      const english = basis[key] ?? source[key];
      if (value === "" || english === undefined || english === "") continue;
      const at = { locale: code, file: fileOf(key), key };
      const mine = anatomies.get(code)!.get(key);
      const theirs = anatomyOf(english, key);
      if (mine !== undefined && theirs !== undefined) {
        const differs = (a: string[], b: string[]) =>
          a.join("|") !== b.join("|");
        if (differs(mine.placeholders, theirs.placeholders)) {
          problems.push({
            guard: "placeholders",
            ...at,
            message: `the parts in curly braces don't match the English. Yours has ${describe(mine.placeholders)}, the English has ${describe(theirs.placeholders)}. Copy each one exactly, you can move it anywhere`,
          });
        }
        if (differs(mine.tags, theirs.tags)) {
          const tag = (t: string) => `<${t}>`;
          problems.push({
            guard: "tags",
            ...at,
            message: `the tags don't match the English. Yours has ${describe(mine.tags, tag)}, the English has ${describe(theirs.tags, tag)}`,
          });
        }
        if (differs(mine.urls, theirs.urls)) {
          problems.push({
            guard: "tags",
            ...at,
            message: `the web links don't match the English. Yours has ${describe(mine.urls)}, the English has ${describe(theirs.urls)}`,
          });
        }
      }
      const ceiling = Math.max(3 * english.length, english.length + 40);
      if (value.length > ceiling) {
        problems.push({
          guard: "length",
          ...at,
          message: `this is ${value.length} characters, too long for the space it's shown in. The most is ${ceiling} (the English is ${english.length})`,
        });
      }
    }
  }
}

// --- key set: a translation mirrors the source exactly; a variant carries only what differs ---

function checkKeys(
  declared: string[],
  files: GuardInput["files"],
  catalogues: Map<string, Catalogue>,
  source: Catalogue,
  problems: Problem[]
) {
  const sourceKeysByFile = new Map<string, string[]>();
  for (const key of Object.keys(source)) {
    const file = fileOf(key);
    sourceKeysByFile.set(file, [...(sourceKeysByFile.get(file) ?? []), key]);
  }
  for (const code of declared) {
    if (code === SOURCE_LOCALE) continue;
    const variant = isVariantLocale(code);
    const catalogue = catalogues.get(code)!;
    for (const [key, value] of Object.entries(catalogue)) {
      const at = {
        guard: "keys" as const,
        locale: code,
        file: fileOf(key),
        key,
      };
      if (!(key in source)) {
        problems.push({ ...at, message: `not a key ${SOURCE_LOCALE} has` });
      } else if (variant && value === source[key]) {
        problems.push({
          ...at,
          message: `identical to ${SOURCE_LOCALE}; a variant locale carries only what differs`,
        });
      } else if (variant && value === "") {
        problems.push({
          ...at,
          message: `empty; a variant locale carries only what differs, so a key it does not change is absent`,
        });
      }
    }
    if (variant) continue;
    for (const [file, keys] of sourceKeysByFile) {
      if (files[code]![file.replace(/\.json$/, "")] === undefined) {
        problems.push({
          guard: "keys",
          locale: code,
          file,
          message: `this file is missing. The English one has ${countOf(keys.length, "line", "lines")} in it`,
        });
        continue;
      }
      for (const key of keys) {
        if (key in catalogue) continue;
        problems.push({
          guard: "keys",
          locale: code,
          file,
          key,
          message: `this line is missing. Every language keeps every line the English has, with "" for ones not translated yet`,
        });
      }
    }
  }
}

// --- prose bans ---

function checkProse(
  declared: string[],
  catalogues: Map<string, Catalogue>,
  prose: readonly ProseBan[],
  problems: Problem[]
) {
  for (const code of declared) {
    const english = code === SOURCE_LOCALE || isVariantLocale(code);
    for (const [key, value] of Object.entries(catalogues.get(code)!)) {
      if (value === "") continue;
      for (const ban of prose) {
        if (ban.scope === "english" && !english) continue;
        if (ban.test(value)) {
          problems.push({
            guard: "prose",
            locale: code,
            file: fileOf(key),
            key,
            message: ban.label,
          });
        }
      }
    }
  }
}

// --- the index: one entry per source key, no entry for a key that is gone ---

function checkIndex(index: unknown, source: Catalogue, problems: Problem[]) {
  const at = { guard: "index" as const, file: "index.json" };
  if (index === undefined) {
    problems.push({ ...at, message: "missing; regenerate it" });
    return;
  }
  if (!isRecord(index)) {
    problems.push({ ...at, message: "not an object; regenerate it" });
    return;
  }
  for (const [key, entry] of Object.entries(index)) {
    if (!(key in source)) {
      problems.push({
        ...at,
        key,
        message: `names a key ${SOURCE_LOCALE} does not have; regenerate it`,
      });
    } else if (
      !isRecord(entry) ||
      typeof entry.accessibleName !== "boolean" ||
      !Array.isArray(entry.sites)
    ) {
      problems.push({ ...at, key, message: "malformed; regenerate it" });
    }
  }
  for (const key of Object.keys(source)) {
    if (!(key in index))
      problems.push({ ...at, key, message: "missing; regenerate it" });
  }
}

// --- helpers ---

/** `a, b, c` through `wrap`, or `(none)`. */
function describe(
  items: string[],
  wrap: (s: string) => string = (s) => s
): string {
  return items.length === 0 ? "none" : items.map(wrap).join(", ");
}

function countOf(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A stable order for a report: by locale, file, key, then message. */
function sorted(problems: Problem[]): Problem[] {
  const rank = (p: Problem) =>
    [p.locale ?? "", p.file ?? "", p.key ?? "", p.message].join("\u0000");
  return problems.sort((a, b) =>
    rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0
  );
}
