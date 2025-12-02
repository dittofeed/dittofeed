import jsonPath from "jsonpath";
import { err, ok, Result } from "neverthrow";

export function toJsonPathParam({
  path,
}: {
  path: string;
}): Result<string, Error> {
  let unvalidated: string;
  if (path.startsWith("$")) {
    unvalidated = path;
  } else {
    unvalidated = `$.${path}`;
  }

  try {
    jsonPath.parse(unvalidated);
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return err(e as Error);
  }
  return ok(unvalidated);
}
