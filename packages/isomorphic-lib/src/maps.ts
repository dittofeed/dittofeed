export function getUnsafe<K, V>(map: Map<K, V>, key: K): V {
  const v = map.get(key);
  if (v === undefined) {
    throw new Error(`Key ${key} not found in map`);
  }
  return v;
}
