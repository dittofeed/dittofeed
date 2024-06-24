import jsonPath from "jsonpath";
import { Result, ok, err } from "neverthrow";

export function toJsonPathParam({
  path,
}: {
  path: string;
}): Result<string, Error> {
  console.log("loc12 path", path);
  let unvalidated: string;
  if (path.startsWith("$")) {
    unvalidated = path;
  } else {
    unvalidated = `$.${path}`;
  }
  try {
    jsonPath.parse(unvalidated);
  } catch (e) {
    return err(e as Error);
  }
  console.log("loc12.1 unvalidated", unvalidated);
  return ok(unvalidated);
}
