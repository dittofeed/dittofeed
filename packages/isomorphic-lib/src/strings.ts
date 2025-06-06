export function isNaturalNumber(str: string): boolean {
  return /^\d+$/.test(str);
}

export function isFloat(str: string): boolean {
  if (str.trim() === "") {
    return false;
  }
  const num = Number(str);
  return !Number.isNaN(num) && Number.isFinite(num);
}

export function isStringPresent(str: string | null | undefined): boolean {
  return !!str && str.length > 0;
}

/**
 * Returns the string before the first asterisk in the input string, or null if
 * no asterisk is found.
 * @param input
 * @returns
 */
export function getStringBeforeAsterisk(input: string): string | null {
  const index = input.indexOf("*");
  if (index === -1) return null; // Return the original string if no '*' is found
  return input.slice(0, index);
}
