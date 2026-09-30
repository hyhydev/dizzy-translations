// Copied from the Dizzy source by the sync. Change it there: an edit here is
// overwritten by the next sync.

// The English-register half of docs/agents/ui-copy.md as patterns, shared by
// the two guards that read English a user will see: check-copy.ts over the
// `.ts`/`.tsx` trees, and scripts/translations/check.ts over the en-GB and
// en-US catalogue files, which are JSON and so invisible to the first.
// docs/agents/no-ai-signifiers.md's list is ai-signifiers.ts beside this
// file; that one crosses the language boundary and these do not.

/** The em-dash. En-dashes stay legal: scores, ranges, the empty-value placeholder. */
export const EM_DASH = "—";

// A whole label, not a word in a sentence: the text must fill its string
// literal or its JSX element. `Show less`, `See Less`, a bare `Less` — nothing
// else. Case-insensitive on the word so a lowercase button label is caught too.
// The first form runs over a raw source line, where the quotes and tags are
// the proof it is a whole label; the second over a catalogue value, which IS
// the whole label.
export const LESS_LABEL = /["'`>]\s*(?:show |see |view )?less\s*["'`<]/i;
export const LESS_LABEL_TEXT = /^\s*(?:show |see |view )?less\s*$/i;

/** "Scene" for a Community, in any case and either number. */
export const SCENE_WORD = /\bscenes?\b/i;

// A prose chunk that is really an identifier: one lowercase token with no
// spaces. An import specifier (`./scene-frame`, `@/lib/scene-sections`, or
// `@/app/[lang]/dashboard/scene/...` through a dynamic segment or a route
// group), a testid (`game-scene-row`), a panel id (`scenes`), a cache tag.
// The word in a sentence always brings a space or a capital with it, so this
// exemption costs the ban nothing it would otherwise catch.
export const IDENTIFIER_CHUNK = /^[a-z0-9@._/[\]()-]+$/;
