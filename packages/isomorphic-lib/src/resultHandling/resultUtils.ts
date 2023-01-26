import { Result } from "neverthrow";

/**
 * Takes a result and returns the value, or throws the error. Drop-in
 * replacement for neverthrow's _unsafeUnwrap which doesn't throw original
 * error.
 * @param r result to be unwrapped
 * @returns contained value
 */
export function unwrap<R, E>(r: Result<R, E>): R {
  if (r.isErr()) {
    const e = r.error;
    if (e instanceof Error) {
      throw e;
    }
    throw new Error(JSON.stringify(e));
  }
  return r.value;
}
