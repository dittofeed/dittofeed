import stringify from "json-stable-stringify";

export function deepEquals<T>(a: T, b: T): boolean {
  return stringify(a) === stringify(b);
}
