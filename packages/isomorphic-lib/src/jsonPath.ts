import jsonPath from "jsonpath";
import { err, ok, Result } from "neverthrow";

export function toJsonPathParam({
  path,
}: {
  path: string;
}): Result<string, Error> {
  console.log("loc4", path);
  let unvalidated: string;
  if (path.startsWith("$")) {
    unvalidated = path;
  } else {
    unvalidated = `$.${path}`;
  }

  console.log("loc5", unvalidated);
  try {
    jsonPath.parse(unvalidated);
  } catch (e) {
    return err(e as Error);
  }
  return ok(unvalidated);
}
