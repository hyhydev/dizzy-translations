// Copied from the Dizzy source by the sync. Change it there: an edit here is
// overwritten by the next sync.

// The catalogue's shape (ADR 0125 §4): one directory per locale under
// packages/domain/messages/, one flat JSON file per namespace, and the key's
// first segment naming the file. `dashboard.community` is the one namespace
// with a dot in it, so a key resolves to the LONGEST namespace that prefixes
// it. The list is hand-declared here, the source of truth for the generators
// and the loader alike; the key union is generated from the files.

export const NAMESPACES = [
  "common",
  "tournament",
  "event",
  "community",
  "profile",
  "player",
  "dashboard",
  "dashboard.community",
  "import",
  "game",
  "series",
  "lib",
  "flag",
  "mobile",
  "notifications",
] as const;

export type Namespace = (typeof NAMESPACES)[number];

/** The namespace (so the file) a key belongs to, or null for a key no namespace claims. */
export function namespaceOf(key: string): Namespace | null {
  let best: Namespace | null = null;
  for (const namespace of NAMESPACES) {
    if (
      key.startsWith(`${namespace}.`) &&
      (best === null || namespace.length > best.length)
    ) {
      best = namespace;
    }
  }
  return best;
}
