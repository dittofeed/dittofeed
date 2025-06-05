// Round to a certain number of decimal places in base 10
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

export function parseFloat(val: string): number {
  const parsed = Number.parseFloat(val);
  if (Number.isNaN(parsed)) {
    throw new Error(`Failed to parse float from ${val}`);
  }
  return parsed;
}

export function floorToNearest(num: number, nearest: number): number {
  return Math.floor(num / nearest) * nearest;
}
