const DOMAIN_REGEX =
  /^(?!-)[A-Za-z0-9-]+(?<!-)(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

const INVALID_COMMON_EMAIL_DOMAINS = new Set([
  "gmail",
  "yahoo",
  "hotmail",
  "outlook",
  "aol",
  "icloud",
  "protonmail",
  "zoho",
  "mail",
  "gmx",
  "yandex",
]);

export function isValidWorkspaceDomain(domain: string): boolean {
  if (!domain) return false;
  const lowerDomain = domain.toLowerCase();

  if (lowerDomain.length > 255) return false;
  if (lowerDomain.startsWith(".") || lowerDomain.endsWith(".")) return false;

  // Reject common email domains by checking their constituent parts
  const parts = lowerDomain.split(".");
  // A domain must have at least two parts (e.g., name.tld) to be checked here.
  // Shorter or malformed domains will be caught by the DOMAIN_REGEX.
  if (parts.length >= 2) {
    // Iterate through parts of the domain, excluding the last part (assumed TLD).
    // For "foo.gmail.com", parts are ["foo", "gmail", "com"]. We check "foo" and "gmail".
    for (const part of parts) {
      if (INVALID_COMMON_EMAIL_DOMAINS.has(part)) {
        return false; // Found a restricted part
      }
    }
  }

  return DOMAIN_REGEX.test(lowerDomain);
}
