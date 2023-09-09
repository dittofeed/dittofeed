export function round(num: number, decimalPlaces = 0) {
  const precision = 10 ** decimalPlaces;
  return Math.round((num + Number.EPSILON) * precision) / precision;
}
