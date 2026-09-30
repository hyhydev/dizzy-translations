// Copied from the Dizzy source by the sync. Change it there: an edit here is
// overwritten by the next sync.

// The ICU message formatter (ADR 0125 §4, spike #2113). ADR 0084's shape: the
// pure half lives here, each app wraps it in thin glue. `intl-messageformat`
// is the one external specifier this package imports, allow-listed in
// scripts/check-purity.ts with the reasoning beside it. It reaches CLDR
// through the platform's own `Intl`, exactly as datetime.ts and flag.ts
// already do, so Hermes' missing `Intl.PluralRules` is a polyfill on the
// mobile entry rather than something this module works around.

import IntlMessageFormat, { type Formatters } from "intl-messageformat";

/** What a placeholder may carry. Deliberately not `any`. */
export type MessageValue = string | number | boolean | Date | null | undefined;
export type MessageValues = Readonly<Record<string, MessageValue>>;

/** The closed tag set a rich message may use (ADR 0125 §4). */
export type RichTag = "b" | "link" | "code";
export type RichHandler<T> = (chunks: (string | T)[]) => T;
export type RichHandlers<T> = Partial<Record<RichTag, RichHandler<T>>>;

export type FormatOptions = {
  /**
   * The viewer's IANA zone. `{x, date}` and `{x, time}` are banned from the
   * catalogue, but a leaked one would otherwise format in the ambient process
   * zone: UTC on the server, the device's in the client, from the same string
   * across a hydration boundary. The zone is injected ahead of whatever the
   * message asked for, so a leak renders in the viewer's zone rather than UTC.
   */
  timeZone?: string;
  /** The catalogue key the source was looked up by, named to the reporter only. */
  key?: string;
};

export type MessageErrorDetail = {
  locale: string;
  source: string;
  key?: string;
};

/**
 * Told about a message that could not be formatted. The app supplies it,
 * loud in dev and a counter or nothing in production, because deciding that
 * here would mean this module knowing which app and which environment it is
 * in.
 */
export type MessageErrorReporter = (
  detail: MessageErrorDetail,
  error: unknown
) => void;

let report: MessageErrorReporter | undefined;

/** Install the reporter. Each app calls this once, at start-up. */
export function onMessageError(
  reporter: MessageErrorReporter | undefined
): void {
  report = reporter;
}

// `Intl` constructors are expensive and the same handful of shapes recur, so
// each is memoised on its arguments. intl-messageformat memoises its own
// defaults the same way, but supplying `formatters` replaces them wholesale.
function memoise<A extends unknown[], T>(create: (...args: A) => T) {
  const cache = new Map<string, T>();
  return (...args: A): T => {
    const key = JSON.stringify(args);
    let value = cache.get(key);
    if (value === undefined) {
      value = create(...args);
      cache.set(key, value);
    }
    return value;
  };
}

const numberFormat = memoise(
  (...args: ConstructorParameters<typeof Intl.NumberFormat>) =>
    new Intl.NumberFormat(...args)
);
const pluralRules = memoise(
  (...args: ConstructorParameters<typeof Intl.PluralRules>) =>
    new Intl.PluralRules(...args)
);
const dateTimeFormat = memoise(
  (...args: ConstructorParameters<typeof Intl.DateTimeFormat>) =>
    new Intl.DateTimeFormat(...args)
);

// The zone of the call in flight. Formatting is synchronous, so a module
// variable set for the duration of one `format()` is exact, and it keeps the
// compiled message cache keyed on (locale, source) rather than on every zone
// a viewer might have.
let viewerZone: string | undefined;

const formatters: Formatters = {
  getNumberFormat: (locales, opts) =>
    numberFormat(locales, opts as Intl.NumberFormatOptions | undefined),
  getPluralRules: (locales, opts) => pluralRules(locales, opts),
  getDateTimeFormat: (locales, opts) =>
    dateTimeFormat(
      locales,
      viewerZone === undefined ? opts : { ...opts, timeZone: viewerZone }
    ),
};

// Compiling an ICU string is the expensive half and the catalogue is fixed at
// build, so the compiled form is cached for the process. Keyed by locale and
// SOURCE, never by locale and key: under the fallback chain the same key
// legitimately carries a different source in the same locale (a key missing
// from `fr` is served the `en-GB` string while the locale stays `fr`), so a
// key-shaped cache would hand back the English compile for ever after,
// including once `fr` gained a translation. The tag mode is in the key too,
// because `ignoreTag` changes how the source parses.
const compiled = new Map<string, IntlMessageFormat>();

function compile(source: string, locale: string, ignoreTag: boolean) {
  const cacheKey = `${locale}\u0000${ignoreTag ? "t" : "r"}\u0000${source}`;
  let format = compiled.get(cacheKey);
  if (format === undefined) {
    format = new IntlMessageFormat(source, locale, undefined, {
      formatters,
      ignoreTag,
    });
    compiled.set(cacheKey, format);
  }
  return format;
}

/**
 * Format one ICU source in a locale. **Never throws**, which is the whole
 * point of it: the catalogues are edited by volunteers through a pull request,
 * so the two realistic faults are a translator dropping a `{placeholder}` the
 * source had and an unbalanced brace in a hand-edited string. Both make
 * `intl-messageformat` throw (`MissingValueError` and a parser `SyntaxError`),
 * and a throw from here unwinds to the nearest error boundary, so one bad
 * string in one locale would blank a whole page for the people reading in
 * that language and nobody else. Degrading to the unformatted source keeps the
 * page up and leaves one odd-looking string.
 *
 * This is the last line, not the defence. The guard set (ADR 0125 §4:
 * placeholder arity, tag equality, the copy bans) is what stops a broken
 * string reaching a build; `report` is how the app finds out that one got
 * through anyway.
 *
 * With `rich` handlers the message may carry the closed tag set and the result
 * is the parts array; without them tags are ignored and the result is a
 * string. Call `t()` or `tRich()` for the typed face rather than this.
 */
export function formatMessage<T = never>(
  source: string,
  locale: string,
  values?: MessageValues,
  opts?: FormatOptions & { rich?: RichHandlers<T> }
): string | (string | T)[] {
  const previousZone = viewerZone;
  viewerZone = opts?.timeZone;
  try {
    const rich = opts?.rich;
    const result = compile(source, locale, rich === undefined).format<T>({
      ...values,
      ...rich,
    });
    if (typeof result === "string") return result;
    if (Array.isArray(result)) return result;
    return [result];
  } catch (error) {
    report?.({ locale, source, key: opts?.key }, error);
    return source;
  } finally {
    viewerZone = previousZone;
  }
}

/**
 * The string face: built with `ignoreTag`, so a stray `<b>` renders literally
 * instead of throwing, and typed `string` so it fits every `aria-label`,
 * `title`, `placeholder` and `new Error()` site.
 */
export function t(
  source: string,
  locale: string,
  values?: MessageValues,
  opts?: FormatOptions
): string {
  const result = formatMessage<never>(source, locale, values, opts);
  return typeof result === "string" ? result : result.join("");
}

/**
 * The rich face: the message may use `b`, `link` and `code`, each rendered by
 * the handler the caller supplies (`<strong>` on the web, a nested `Text` on
 * the phone), and the result is the parts array to spread into a parent. A
 * tag with no handler is a fault like any other and degrades to the source.
 */
export function tRich<T>(
  source: string,
  locale: string,
  values: MessageValues | undefined,
  handlers: RichHandlers<T>,
  opts?: FormatOptions
): (string | T)[] {
  const result = formatMessage<T>(source, locale, values, {
    ...opts,
    rich: handlers,
  });
  return typeof result === "string" ? [result] : result;
}

/** Drop the compile cache. Exists for tests; nothing in an app calls it. */
export function resetMessageCache(): void {
  compiled.clear();
}
