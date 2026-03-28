/** Substring match for strings/scalars; element match for arrays (JS Array#includes semantics). */
export function valueMatchesContains(needle: string, value: unknown): boolean {
  if (typeof value === "string") {
    return value.includes(needle);
  }
  if (Array.isArray(value)) {
    return value.some((el) => el === needle || String(el) === needle);
  }
  if (value == null) {
    return false;
  }
  return String(value).includes(needle);
}
