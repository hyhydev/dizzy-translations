// Copied from the Dizzy source by the sync. Change it there: an edit here is
// overwritten by the next sync.

// The shape of locales.json (ADR 0125 §2), for the guards that validate it in
// both repositories. Lives beside the file and outside src/ because the
// runtime never validates: it reads the file as data, typed by
// src/i18n/locales.ts, and this schema is what proves the file fits that
// type before a merge. `parseLocales` returning `Locales` is the drift guard
// between the two.

import { z } from "zod";
import { SOURCE_LOCALE, type Locales } from "../i18n/locales";

/** A locale code as a catalogue directory is named: `fr`, `pt-BR`, `zh-Hant-TW`. */
export const LOCALE_CODE =
  /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$/;

/** A claimed tag prefix: any well-formed BCP 47 prefix, matched case-insensitively. */
const TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export const localeEntrySchema = z.strictObject({
  dir: z.enum(["ltr", "rtl"]),
  fallback: z.array(z.string().regex(LOCALE_CODE)),
  reviewer: z.string().min(1),
  status: z.enum(["selectable", "unselectable"]),
  name: z.string().min(1),
  tags: z.array(z.string().regex(TAG)).min(1),
});

export const localesSchema = z
  .record(z.string().regex(LOCALE_CODE), localeEntrySchema)
  .superRefine((locales, ctx) => {
    const source = locales[SOURCE_LOCALE];
    if (source === undefined) {
      ctx.addIssue({
        code: "custom",
        message: `${SOURCE_LOCALE} must be declared: it closes every fallback chain`,
      });
    } else if (source.fallback.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: [SOURCE_LOCALE, "fallback"],
        message: `${SOURCE_LOCALE} is the source locale and falls back to nothing`,
      });
    }
    const claimed = new Map<string, string>();
    for (const [code, entry] of Object.entries(locales)) {
      entry.fallback.forEach((next, i) => {
        if (next === code) {
          ctx.addIssue({
            code: "custom",
            path: [code, "fallback", i],
            message: `${code} cannot fall back to itself`,
          });
        } else if (!(next in locales)) {
          ctx.addIssue({
            code: "custom",
            path: [code, "fallback", i],
            message: `${code} falls back to ${next}, which is not declared`,
          });
        }
      });
      entry.tags.forEach((tag, i) => {
        const lower = tag.toLowerCase();
        const holder = claimed.get(lower);
        if (holder !== undefined && holder !== code) {
          ctx.addIssue({
            code: "custom",
            path: [code, "tags", i],
            message: `${tag} is already claimed by ${holder}; negotiation needs one owner per prefix`,
          });
        }
        claimed.set(lower, code);
      });
    }
  });

/** Validate a parsed locales.json, or throw a ZodError naming what is wrong. */
export function parseLocales(raw: unknown): Locales {
  return localesSchema.parse(raw);
}
