// Copied from the Dizzy source by the sync. Change it there: an edit here is
// overwritten by the next sync.

// The mechanical half of docs/agents/no-ai-signifiers.md.
//
// Shared by the two guards that can see user-facing prose: check-copy.ts walks
// `.ts`/`.tsx` in the app and package trees, and release.ts runs the same list
// over every pending `.changes/*.md` note at the cut, which is the last point
// before a note publishes.
//
// Every pattern is word-bounded and specific enough to have no false positives,
// matching the release check's rule that an error is only ever something
// certain. Two deliberate absences:
//
//   - a bare `AI`, because it is Anguilla in apps/web/lib/countries.ts
//   - a bare "generated", because the Prisma client and the release history are
//     both legitimately generated
//
// Neither guard can see a commit message, a PR body or an issue. Those depend
// on the rule being followed rather than caught.

export const SIGNIFIERS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bclaude\b/i, label: "Claude" },
  { pattern: /\banthropic\b/i, label: "Anthropic" },
  { pattern: /\bchat ?gpt\b/i, label: "ChatGPT" },
  { pattern: /\bopen ?ai\b/i, label: "OpenAI" },
  { pattern: /\bgpt-?\d/i, label: "GPT-n" },
  { pattern: /\bcopilot\b/i, label: "Copilot" },
  { pattern: /\bllms?\b/i, label: "LLM" },
  {
    pattern: /\bai[-\s](powered|generated|assisted|written|driven)\b/i,
    label: "AI-powered and friends",
  },
  { pattern: /\bpowered by ai\b/i, label: "powered by AI" },
  { pattern: /\bco-authored-by\b/i, label: "Co-Authored-By trailer" },
  { pattern: /🤖/u, label: "robot glyph" },
];

/** Every signifier label present in `text`, in list order. */
export function signifiersIn(text: string): string[] {
  return SIGNIFIERS.filter((s) => s.pattern.test(text)).map((s) => s.label);
}
