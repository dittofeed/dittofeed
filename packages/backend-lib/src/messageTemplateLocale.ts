import { and, eq } from "drizzle-orm";

import config from "./config";
import { db } from "./db";
import { messageTemplate as dbMessageTemplate } from "./db/schema";
import { MessageTemplate } from "./types";

/**
 * The locale-less baseline. A workspace starts with baseline templates, and any
 * locale that has no template of its own falls back to them, so localizing a
 * workspace never requires translating every message.
 */
export const BASELINE_LOCALE = "";

// A BCP-47 tag lower cased, with subtags of 1 to 8 alphanumerics. Deliberately
// loose: the tag only has to round trip through the fallback chain, and
// rejecting a valid regional variant would silently send the baseline instead.
const LOCALE_PATTERN = /^[a-z]{2,8}(-[a-z0-9]{1,8})*$/;

/**
 * Lower cases a locale tag and normalizes `_` to `-`, so `zh_Hant_HK` and
 * `zh-hant-hk` address the same template. Returns undefined for a value that is
 * not a plausible locale, which the callers treat as "no locale preference".
 */
export function normalizeLocale(locale?: string | null): string | undefined {
  if (!locale) {
    return undefined;
  }
  const normalized = locale.trim().toLowerCase().replace(/_/g, "-");
  if (!normalized.length || !LOCALE_PATTERN.test(normalized)) {
    return undefined;
  }
  return normalized;
}

/**
 * A locale and every prefix of it, most specific first: `zh-hant-hk` yields
 * `["zh-hant-hk", "zh-hant", "zh"]`. A translation for `zh-hant` therefore
 * serves a `zh-hant-hk` recipient without an exact match.
 */
function localeAndParents(locale: string | undefined): string[] {
  if (!locale) {
    return [];
  }
  const segments = locale.split("-");
  const chain: string[] = [];
  for (let { length } = segments; length > 0; length -= 1) {
    chain.push(segments.slice(0, length).join("-"));
  }
  return chain;
}

/**
 * The order in which templates are tried for a recipient: the recipient's own
 * locale and its prefixes, then the workspace default and its prefixes, then
 * the baseline. Duplicates collapse, so a recipient whose locale *is* the
 * workspace default does not look the same tag up twice.
 */
export function localeFallbackChain(
  locale: string | null | undefined,
  defaultLocale: string | null | undefined,
): string[] {
  const chain: string[] = [];
  const candidates = [
    ...localeAndParents(normalizeLocale(locale)),
    ...localeAndParents(normalizeLocale(defaultLocale)),
  ];
  for (const candidate of candidates) {
    if (!chain.includes(candidate)) {
      chain.push(candidate);
    }
  }
  chain.push(BASELINE_LOCALE);
  return chain;
}

/**
 * Every stored version of one message template, ordered by how well it matches
 * the recipient. The row the caller started from is always the last entry, so a
 * template stored under a locale the chain does not know still renders instead
 * of disappearing.
 *
 * A localized template shares its `name` with the baseline, so the name — not
 * the id — is what gathers the family. That also means a broadcast, which holds
 * a template id, resolves per recipient rather than per send.
 */
export async function messageTemplateLocaleCandidates({
  workspaceId,
  template,
  locale,
}: {
  workspaceId: string;
  template: MessageTemplate;
  locale?: string | null;
}): Promise<MessageTemplate[]> {
  const chain = localeFallbackChain(locale, config().defaultLocale);
  const rows = await db().query.messageTemplate.findMany({
    where: and(
      eq(dbMessageTemplate.workspaceId, workspaceId),
      eq(dbMessageTemplate.name, template.name),
    ),
  });
  const ranked = rows
    .map((row) => ({ row, rank: chain.indexOf(row.locale) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map(({ row }) => row);

  if (!ranked.some((row) => row.id === template.id)) {
    ranked.push(template);
  }
  return ranked;
}
