export function isNaturalNumber(str: string): boolean {
  return /^\d+$/.test(str);
}

export function isStringPresent(str: string | null | undefined): boolean {
  return !!str && str.length > 0;
}
