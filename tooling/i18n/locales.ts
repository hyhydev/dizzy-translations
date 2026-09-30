// Copied from the Dizzy source by the sync. Change it there: an edit here is
// overwritten by the next sync.

// The locale manifest as the runtime reads it (ADR 0125 §2). `locales.json`,
// beside the catalogue in packages/domain/messages/, carries only what `Intl`
// cannot answer for itself; everything here is a pure function over that
// file, which the caller passes in. This module imports no JSON so the
// package's consumers decide how the file reaches them: a static import on
// the web and the phone, a read from disk in the guards.

export type LocaleDirection = "ltr" | "rtl";

/** Whether the locale is offered in the switchers and negotiated for. */
export type LocaleStatus = "selectable" | "unselectable";

export type LocaleEntry = {
  dir: LocaleDirection;
  /**
   * The locales a missing key resolves through, nearest first. `en-GB` closes
   * every chain whether or not it is listed, so the source locale itself
   * declares none.
   */
  fallback: readonly string[];
  /** The named person who publishes this locale (ADR 0125 §4). */
  reviewer: string;
  status: LocaleStatus;
  /** The endonym, shown by both switchers; Hermes has no `Intl.DisplayNames`. */
  name: string;
  /**
   * The language-tag prefixes this locale claims, matched against a viewer's
   * first preference. `en` claims every English; `en-US` claims only that.
   */
  tags: readonly string[];
};

export type Locales = Readonly<Record<string, LocaleEntry>>;

/** The locale the source strings are written in, and the floor of every chain. */
export const SOURCE_LOCALE = "en-GB";

/**
 * The locales a key is looked up in, in order: the locale itself, then each
 * declared fallback (and its own fallbacks, depth first), then `en-GB`. A
 * locale the manifest does not declare has nothing but the floor, so a forged
 * cookie resolves to English rather than to an empty catalogue. Cycles are
 * tolerated, since the guard that forbids them runs in the public repository
 * and the runtime must not depend on it having run.
 */
export function fallbackChain(locale: string, locales: Locales): string[] {
  const chain: string[] = [];
  const visit = (code: string) => {
    if (chain.includes(code)) return;
    const entry = locales[code];
    if (entry === undefined) return;
    chain.push(code);
    for (const next of entry.fallback) visit(next);
  };
  visit(locale);
  if (!chain.includes(SOURCE_LOCALE)) chain.push(SOURCE_LOCALE);
  return chain;
}

/**
 * A variant locale shares the source's language and carries only the keys
 * whose text differs, resolving the rest along its chain (ADR 0125 §2):
 * `en-US`. Every other declared locale is a translation locale. The loader
 * applies the same rule when it decides which fallbacks to mark.
 */
export function isVariantLocale(locale: string): boolean {
  return (
    locale !== SOURCE_LOCALE &&
    primaryLanguage(locale) === primaryLanguage(SOURCE_LOCALE)
  );
}

/** The language subtag of a tag, lower-cased: `en` from `en-US`, `fr` from `FR-FR`. */
export function primaryLanguage(tag: string): string {
  return tag.trim().toLowerCase().split("-")[0] ?? "";
}

/**
 * The tags of an `Accept-Language` header in the order the client wrote them,
 * quality weights dropped. Weights are ignored on purpose: negotiation is
 * anchored first-tag matching (below), the same rule the web's rewrite
 * ladder applies as a regex on the raw header, and a regex cannot reorder by
 * `q`. Sorting here would make the phone disagree with the web.
 */
export function parseAcceptLanguage(
  header: string | null | undefined
): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => part.split(";")[0]?.trim() ?? "")
    .filter((tag) => tag.length > 0);
}

/**
 * Anchored first-tag matching over the manifest (ADR 0125 §2): only the
 * client's top preference is consulted, matched case-insensitively against
 * the tag prefixes each selectable locale claims, and the longest claim wins.
 * So `fr-CA` lands on `fr`, `en-AU` on `en-GB`, and only `en-US` on `en-US`.
 * The case it gets wrong, an unsupported top preference over a supported
 * second one, yields `en-GB`; that is the stated limitation, shared with the
 * web ladder, not a bug here. A wildcard or an empty list is a bot and gets
 * the source locale.
 */
export function negotiate(tags: readonly string[], locales: Locales): string {
  const first = tags[0]?.trim().toLowerCase();
  if (!first || first === "*") return SOURCE_LOCALE;
  let best: { code: string; length: number } | undefined;
  for (const [code, entry] of Object.entries(locales)) {
    if (entry.status !== "selectable") continue;
    for (const claimed of entry.tags) {
      const prefix = claimed.toLowerCase();
      const matches = first === prefix || first.startsWith(`${prefix}-`);
      if (matches && (best === undefined || prefix.length > best.length)) {
        best = { code, length: prefix.length };
      }
    }
  }
  return best?.code ?? SOURCE_LOCALE;
}

/**
 * The locale codes marked selectable, in manifest order. This one list is
 * what the web's rewrite ladder, its prerender list and its prefixed-URL
 * redirect are generated from, and what the phone's switcher offers (ADR
 * 0125 §3): flipping a locale's `status` is the single act that adds it to
 * all of them at once.
 */
export function selectableLocales(locales: Locales): string[] {
  return Object.entries(locales)
    .filter(([, entry]) => entry.status === "selectable")
    .map(([code]) => code);
}

/**
 * Whether a code is a locale the ladder may route to and the layout may
 * render: exact on case, because Vercel's cookie regex is case-insensitive
 * and the capture keeps the request's case, so `EN-gb` must NOT pass (ADR
 * 0125 §3, invariant 3).
 */
export function isSelectableLocale(code: string, locales: Locales): boolean {
  return selectableLocales(locales).includes(code);
}

/**
 * Whether an identifier is any locale code the manifest declares, selectable
 * or not, matched case-insensitively. This is the rule for a slot a locale
 * segment could one day claim (a game id, ADR 0125 §3): a locale becomes
 * selectable by flipping one field, and the routing that reads the segment
 * is case-insensitive on Vercel.
 */
export function isLocaleCode(id: string, locales: Locales): boolean {
  const lower = id.toLowerCase();
  return Object.keys(locales).some((code) => code.toLowerCase() === lower);
}
