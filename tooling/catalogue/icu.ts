// Copied from the Dizzy source by the sync. Change it there: an edit here is
// overwritten by the next sync.

// The ICU parser as the tooling sees it. The guards and the coverage report
// both need to read a message's structure (its placeholders, its tags, the
// words a translator actually writes), and both must read it with the SAME
// parser the runtime formats with, or they prove the wrong thing. That parser
// is reached through the one static `intl-messageformat` exposes rather than
// a second dependency: `@formatjs/icu-messageformat-parser` is not
// resolvable from this package, and a copy would drift.

import IntlMessageFormat from "intl-messageformat";

/**
 * The parser's AST, typed structurally. The numeric `type` is the parser's
 * own TYPE enum, which is not importable from here.
 */
export type IcuNode = {
  type: number;
  value?: string;
  style?: unknown;
  pluralType?: "cardinal" | "ordinal";
  options?: Record<string, { value: IcuNode[] }>;
  children?: IcuNode[];
};

export const ICU = {
  literal: 0,
  argument: 1,
  number: 2,
  date: 3,
  time: 4,
  select: 5,
  plural: 6,
  pound: 7,
  tag: 8,
} as const;

/**
 * Parse a message with tags recognised (so a stray one is visible) and the
 * `other` clause required. Throws the parser's own error on a message that
 * does not parse; the caller decides what that means.
 */
export function parseMessage(message: string): IcuNode[] {
  const parse = IntlMessageFormat.__parse;
  if (parse === undefined) {
    throw new Error("intl-messageformat no longer exposes its parser");
  }
  return parse(message, {
    ignoreTag: false,
    requiresOtherClause: true,
  }) as IcuNode[];
}

/**
 * The argument names a message takes, sorted: every `{name}`, `{name, number}`,
 * `{name, select, …}` and `{name, plural, …}` outside the plural whose own
 * value it is. What a call site must supply, and what the generator turns into
 * a type per key.
 */
export function argumentNames(message: string): string[] {
  const names = new Set<string>();
  const plurals: string[] = [];
  const walk = (nodes: IcuNode[]) => {
    for (const node of nodes) {
      const own = node.value !== undefined && plurals.includes(node.value);
      if (
        (node.type === ICU.argument ||
          node.type === ICU.number ||
          node.type === ICU.select ||
          node.type === ICU.plural) &&
        !own &&
        node.value !== undefined
      ) {
        names.add(node.value);
      }
      if (node.options) {
        if (node.type === ICU.plural) plurals.push(node.value ?? "");
        for (const option of Object.values(node.options)) walk(option.value);
        if (node.type === ICU.plural) plurals.pop();
      }
      if (node.children) walk(node.children);
    }
  };
  walk(parseMessage(message));
  return [...names].sort();
}
