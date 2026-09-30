// Copied from the Dizzy source by the sync. Change it there: an edit here is
// overwritten by the next sync.

// The coverage report (ADR 0125 §4, #2114, #2304): how much of a translation
// locale is translated, in WORDS, per surface, each distinct message counted
// once. Words because a third of the catalogue is one-word buttons and a
// message count is reachable by translating those alone; per surface (a
// namespace, so a file) because a site-wide number hides a wholly English
// `profile`. Three buckets: translated, missing (present as `""`) and
// outdated (translated against English that has since moved, read from the
// locale's basis). Accessible names get their own line, because they can sit
// at zero without moving the number and nobody reviewing a screenshot sees
// them. A report and never a gate: nothing here decides anything, it informs
// the named person flipping `status`. A variant locale is exempt.
//
// Pure over data, like the guards, so the public repository can run it on a
// pull request from the catalogue alone; scripts/translations/coverage.ts is
// the entry point that reads the files and prints the Markdown.

import { NAMESPACES, namespaceOf } from "../i18n/catalogue";
import {
  isVariantLocale,
  type Locales,
  SOURCE_LOCALE,
} from "../i18n/locales";
import { type Basis, outdatedKeys } from "./basis";
import type { Catalogue } from "./files";
import { ICU, type IcuNode, parseMessage } from "./icu";

export type Bucket = { messages: number; words: number };

export type SurfaceCoverage = {
  surface: string;
  /** The denominator: every source message on the surface. */
  total: Bucket;
  translated: Bucket;
  missing: Bucket;
  outdated: Bucket;
};

export type LocaleCoverage = {
  locale: string;
  /** Each namespace that has at least one source key, in catalogue order. */
  surfaces: SurfaceCoverage[];
  /** Site-wide. */
  all: SurfaceCoverage;
  /** The keys `index.json` marks as accessible names. */
  accessibleNames: SurfaceCoverage;
};

export type CoverageReport = {
  denominator: {
    surfaces: { surface: string; messages: number; words: number }[];
    all: Bucket;
    accessibleNames: Bucket;
  };
  /** Translation locales in manifest order. */
  locales: LocaleCoverage[];
  /** The variant locales, named so the report can say why they are absent. */
  exempt: string[];
};

export type CoverageInput = {
  manifest: Locales;
  source: Catalogue;
  /** Every non-source locale's flattened catalogue, keyed by locale. */
  catalogues: Readonly<Record<string, Catalogue>>;
  /** Each locale's basis, keyed by locale, for the outdated bucket. */
  bases: Readonly<Record<string, Basis>>;
  /** `index.json`, of which only `accessibleName` is read. */
  index: Readonly<Record<string, { accessibleName: boolean }>>;
};

/**
 * The words a translator writes for a message: the literal text split on
 * whitespace, one word per placeholder (it takes a word's place in the
 * sentence), and every plural or select branch counted, because every branch
 * is written. A message that does not parse is counted as its raw tokens, so
 * the report survives a file the guards would fail.
 */
export function wordCount(message: string): number {
  if (message.trim() === "") return 0;
  let nodes: IcuNode[];
  try {
    nodes = parseMessage(message);
  } catch {
    return tokens(message);
  }
  return wordsIn(nodes);
}

// A whitespace token is a word when it carries a letter or a digit, so the
// comma left behind by a placeholder (`{name}, welcome`) is not one and a
// score or a range (`2–1`, `5th–8th`) is one, as the census counted them.
function tokens(text: string): number {
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

function wordsIn(nodes: IcuNode[]): number {
  let words = 0;
  let literal = "";
  const flushLiteral = () => {
    words += tokens(literal);
    literal = "";
  };
  for (const node of nodes) {
    switch (node.type) {
      case ICU.literal:
        literal += node.value ?? "";
        break;
      case ICU.tag:
        // The tag itself is markup; its text is prose like any other.
        flushLiteral();
        words += wordsIn(node.children ?? []);
        break;
      case ICU.plural:
      case ICU.select:
        flushLiteral();
        for (const option of Object.values(node.options ?? {})) {
          words += wordsIn(option.value);
        }
        break;
      default:
        // An argument or `#` stands where a word would.
        flushLiteral();
        words += 1;
    }
  }
  flushLiteral();
  return words;
}

const empty = (): Bucket => ({ messages: 0, words: 0 });
const bucket = (surface: string): SurfaceCoverage => ({
  surface,
  total: empty(),
  translated: empty(),
  missing: empty(),
  outdated: empty(),
});

function count(
  into: SurfaceCoverage,
  state: keyof Omit<SurfaceCoverage, "surface" | "total">,
  words: number
) {
  into.total.messages += 1;
  into.total.words += words;
  into[state].messages += 1;
  into[state].words += words;
}

export function coverage(input: CoverageInput): CoverageReport {
  // A key no namespace claims is malformed; the shape guard reports it, and
  // the report counts what it can place on a surface.
  const keys = Object.keys(input.source)
    .filter((key) => namespaceOf(key) !== null)
    .sort();
  const words = new Map(
    keys.map((key) => [key, wordCount(input.source[key]!)])
  );
  const surfaceOf = (key: string) => namespaceOf(key)!;
  const surfaces = NAMESPACES.filter((ns) =>
    keys.some((key) => surfaceOf(key) === ns)
  );
  const isName = (key: string) => input.index[key]?.accessibleName === true;

  const denominator: CoverageReport["denominator"] = {
    surfaces: surfaces.map((surface) => {
      const mine = keys.filter((key) => surfaceOf(key) === surface);
      return {
        surface,
        messages: mine.length,
        words: mine.reduce((n, key) => n + words.get(key)!, 0),
      };
    }),
    all: {
      messages: keys.length,
      words: keys.reduce((n, key) => n + words.get(key)!, 0),
    },
    accessibleNames: {
      messages: keys.filter(isName).length,
      words: keys.filter(isName).reduce((n, key) => n + words.get(key)!, 0),
    },
  };

  const locales: LocaleCoverage[] = [];
  const exempt: string[] = [];
  for (const code of Object.keys(input.manifest)) {
    if (code === SOURCE_LOCALE) continue;
    if (isVariantLocale(code)) {
      exempt.push(code);
      continue;
    }
    const catalogue = input.catalogues[code] ?? {};
    const outdated = new Set(
      outdatedKeys(input.bases[code] ?? {}, input.source)
    );
    const perSurface = new Map(surfaces.map((s) => [s, bucket(s)]));
    const all = bucket("all");
    const names = bucket("accessible names");
    for (const key of keys) {
      const value = catalogue[key] ?? "";
      const state =
        value === ""
          ? "missing"
          : outdated.has(key)
            ? "outdated"
            : "translated";
      const n = words.get(key)!;
      count(perSurface.get(surfaceOf(key))!, state, n);
      count(all, state, n);
      if (isName(key)) count(names, state, n);
    }
    locales.push({
      locale: code,
      surfaces: [...perSurface.values()],
      all,
      accessibleNames: names,
    });
  }
  return { denominator, locales, exempt };
}

// --- Markdown, for a pull-request comment ---

const num = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const pct = (part: number, whole: number) =>
  `${(whole === 0 ? 0 : (100 * part) / whole).toFixed(1)}%`;
const share = (s: SurfaceCoverage) =>
  s.total.words === 0 ? 0 : (100 * s.translated.words) / s.total.words;
const delta = (now: number, before: number | undefined) =>
  before === undefined
    ? ""
    : ` (${now - before >= 0 ? "+" : "-"}${Math.abs(now - before).toFixed(1)})`;

/**
 * The report as Markdown. With a `base` (the same report over the catalogue
 * before the change), every percentage carries the delta the change causes.
 */
export function renderCoverage(
  report: CoverageReport,
  base?: CoverageReport
): string {
  const out: string[] = ["## Translation coverage", ""];
  const { denominator } = report;
  out.push(
    `The site has ${num(denominator.all.words)} words to translate, in ${num(denominator.all.messages)} lines, ` +
      `across ${num(denominator.surfaces.length)} ${denominator.surfaces.length === 1 ? "part" : "parts"} of the site. ` +
      `A language goes in the site's language menu once about 90% of the words on each part are translated. This is here to help, and never fails a check.`,
    ""
  );

  if (report.locales.length === 0) {
    out.push(
      "No languages are being translated yet. This is what each one will be measured against:",
      ""
    );
    out.push("| Part of the site | Words | Lines |", "| --- | ---: | ---: |");
    for (const s of denominator.surfaces) {
      out.push(`| ${s.surface} | ${num(s.words)} | ${num(s.messages)} |`);
    }
    out.push(
      `| **All** | ${num(denominator.all.words)} | ${num(denominator.all.messages)} |`,
      ""
    );
  }

  for (const locale of report.locales) {
    const before = base?.locales.find((l) => l.locale === locale.locale);
    const row = (
      s: SurfaceCoverage,
      was: SurfaceCoverage | undefined,
      label = s.surface
    ) =>
      `| ${label} | ${num(s.total.words)} | ${num(s.total.messages)} | ${num(s.translated.messages)} | ` +
      `${num(s.missing.messages)} | ${num(s.outdated.messages)} | ` +
      `${pct(s.translated.words, s.total.words)}${delta(share(s), was && share(was))} |`;
    out.push(
      `### ${locale.locale}: ${pct(locale.all.translated.words, locale.all.total.words)} of words translated${delta(share(locale.all), before && share(before.all))}`,
      "",
      "| Part of the site | Words | Lines | Translated | Not yet | Out of date | Words translated |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"
    );
    for (const s of locale.surfaces) {
      out.push(
        row(
          s,
          before?.surfaces.find((b) => b.surface === s.surface)
        )
      );
    }
    out.push(row(locale.all, before?.all, "**All**"), "");
    const names = locale.accessibleNames;
    out.push(
      `Screen-reader labels: ${num(names.translated.messages)} of ${num(names.total.messages)} lines translated, ` +
        `${pct(names.translated.words, names.total.words)} of ${num(names.total.words)} words` +
        `${delta(share(names), before && share(before.accessibleNames))}.`,
      ""
    );
  }

  if (report.exempt.length > 0) {
    out.push(
      `${report.exempt.join(", ")} ${report.exempt.length === 1 ? "isn't" : "aren't"} counted here: ` +
        `${report.exempt.length === 1 ? "it holds" : "they hold"} only the lines that differ from ${SOURCE_LOCALE}.`,
      ""
    );
  }
  return out.join("\n");
}
