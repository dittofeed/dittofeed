export function round(num: number, decimalPlaces = 0) {
  const precision = 10 ** decimalPlaces;
  return Math.round((num + Number.EPSILON) * precision) / precision;
}

export function parseInt(val: string): number {
  const parsed = Number.parseInt(val, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Failed to parse int from ${val}`);
  }
  return parsed;
}
