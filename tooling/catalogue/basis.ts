// Copied from the Dizzy source by the sync. Change it there: an edit here is
// overwritten by the next sync.

// The basis of a translation (ADR 0125 §4): per translation locale, the en-GB
// string each key was translated against, written by the up-sync when a
// translation merges and never hand-edited. A changed English string makes
// every translation of that key silently wrong, present and valid and passing
// every guard, so that state is computed here rather than remembered: a key
// whose current source differs from its basis is OUTDATED, the third coverage
// bucket beside translated and missing. gettext's fuzzy flag, spelled as a
// file. Tooling, outside src/: the runtime never reads a basis.

/** Key to the en-GB string a locale's translation of it was made against. */
export type Basis = Readonly<Record<string, string>>;

/**
 * The keys a locale has translated against English that has since moved.
 * A key with no basis entry is not outdated: it is untranslated, or was
 * translated before the up-sync recorded bases, and either way the coverage
 * report has another bucket for it.
 */
export function outdatedKeys(
  basis: Basis,
  source: Readonly<Record<string, string>>
): string[] {
  return Object.keys(basis)
    .filter((key) => key in source && source[key] !== basis[key])
    .sort();
}

/** The basis the up-sync records: every translated key at its current source. */
export function recordBasis(
  translation: Readonly<Record<string, string>>,
  source: Readonly<Record<string, string>>
): Basis {
  const basis: Record<string, string> = {};
  for (const key of Object.keys(translation).sort()) {
    const english = source[key];
    if (translation[key] !== "" && english !== undefined) basis[key] = english;
  }
  return basis;
}
