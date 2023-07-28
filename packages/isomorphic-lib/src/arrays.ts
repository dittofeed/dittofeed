export function idxUnsafe<I>(arr: I[], index: number): I {
  const v = arr[index];
  if (v === undefined) {
    throw new Error(`Index ${index} not found in array`);
  }
  return v;
}
