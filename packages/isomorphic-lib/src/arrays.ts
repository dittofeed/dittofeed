export function idxUnsafe<I>(arr: I[], index: number): I {
  const v = arr[index];
  if (v === undefined) {
    throw new Error(`Index ${index} not found in array`);
  }
  return v;
}

export function arrayDefault<T>(...arrs: (T[] | undefined | null)[]): T[] {
  for (const arr of arrs) {
    if (arr && arr.length > 0) {
      return arr;
    }
  }
  return [];
}
