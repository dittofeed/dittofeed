// eslint-disable-next-line @typescript-eslint/ban-types
export type NonFunction<T> = T extends Function ? never : T;

type NonFunctionItem<T> = T | null | Promise<T | null>;

type FunctionItem<T> = () => NonFunctionItem<T>;

export type FirstItem<T> = NonFunctionItem<NonFunction<T>> | FunctionItem<T>;

export async function firstPresent<T>(
  items: FirstItem<NonFunctionItem<T>>[]
): Promise<T | null> {
  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop
    const result = await (typeof item === "function"
      ? (item as FunctionItem<T>)()
      : item);
    if (result !== null) {
      return result;
    }
  }
  return null;
}
