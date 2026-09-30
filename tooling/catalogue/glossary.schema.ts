// Copied from the Dizzy source by the sync. Change it there: an edit here is
// overwritten by the next sync.

// The shape of glossary/<locale>.json (ADR 0125 §4, #2120, #2331): the agreed
// word per locale for each thing Dizzy names, with `register` as its first
// entry. Lives beside locales.schema.ts because the manifest check validates
// both. `glossary/en-GB.json` is authored in this repository and down-syncs;
// every other glossary is authored in the translations repository, where a
// volunteer copies the English one and fills it in.
//
// Every locale uses one shape, the English one included: there `use` is the
// English word and `note` is its one-line definition. No guard reads `use` or
// `avoid` against the catalogue (nothing can prove a sentence used the agreed
// word); `avoid` is a list so a reviewer who asks for that guard later can
// have it without a migration. The one cross-file rule, completeness against
// `en-GB`, lives in guards.ts with the other manifest checks.

import { z } from "zod";

export const glossaryEntrySchema = z.strictObject({
  /** The agreed word in this language. */
  use: z.string().trim().min(1),
  /** Words a translator might reach for that mean the wrong thing here. */
  avoid: z.array(z.string().trim().min(1)).optional(),
  /** Anything the next translator should know; in `en-GB`, the definition. */
  note: z.string().optional(),
});

/**
 * A glossary file: one entry per term, keyed by the term's English id, plus
 * an optional `about` paragraph in the file's own language explaining itself.
 */
export const glossarySchema = z
  .object({ about: z.string().optional() })
  .catchall(glossaryEntrySchema);

export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;
export type Glossary = Readonly<Record<string, GlossaryEntry>>;

/** The key a glossary may use for its explanatory paragraph; never a term. */
export const GLOSSARY_ABOUT = "about";

/**
 * Validate a parsed glossary file and return its terms (without `about`), in
 * file order, or the zod error naming what is wrong.
 */
export function parseGlossary(
  raw: unknown
): { ok: true; terms: Glossary } | { ok: false; error: z.ZodError } {
  const parsed = glossarySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error };
  const terms: Record<string, GlossaryEntry> = {};
  for (const [term, entry] of Object.entries(parsed.data)) {
    if (term === GLOSSARY_ABOUT) continue;
    terms[term] = entry as GlossaryEntry;
  }
  return { ok: true, terms };
}
