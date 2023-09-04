export function getUnsafe<K, V>(map: Map<K, V>, key: K): V {
  const v = map.get(key);
  if (v === undefined) {
    throw new Error(`Key ${key} not found in map`);
  }
  return v;
}

export class MapWithDefault<K, V> {
  public map: Map<K, V>;

  public default: V;

  constructor(defaultValue: V) {
    this.map = new Map();
    this.default = defaultValue;
  }

  get(k: K): V {
    return this.map.get(k) ?? this.default;
  }

  set(k: K, v: V): void {
    this.map.set(k, v);
  }
}
