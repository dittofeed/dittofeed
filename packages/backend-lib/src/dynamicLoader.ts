/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
export async function loadDynamicModule<T>({
  path,
  fallback,
}: {
  path?: string;
  fallback: T;
}): Promise<T> {
  if (!path) {
    return fallback;
  }
  const module = await import(path);
  return module as T;
}
