import { err, ok, Result } from "neverthrow";

import {
  jsonParseSafe,
  schemaValidateWithErr,
} from "./resultHandling/schemaValidation";
import {
  JSONValue,
  PerformedManyValueItem,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
} from "./types";

function processUserProperty(
  definition: UserPropertyDefinition,
  value: JSONValue
): Result<JSONValue, Error> {
  switch (definition.type) {
    case UserPropertyDefinitionType.PerformedMany: {
      let parsedValue: JSONValue;
      // deprecated format for performedmany events
      if (typeof value === "string") {
        const jsonParsedValue = jsonParseSafe(value);
        if (jsonParsedValue.isErr()) {
          return err(jsonParsedValue.error);
        }
        parsedValue = jsonParsedValue.value;
      } else {
        // new format for performedmany user properties
        parsedValue = value;
      }

      if (!(parsedValue instanceof Array)) {
        return err(
          new Error("performed many json parsed value is not an array")
        );
      }

      return ok(
        parsedValue.flatMap((item) => {
          const result = schemaValidateWithErr(item, PerformedManyValueItem);
          if (result.isErr()) {
            return [];
          }
          const parsedProperties = jsonParseSafe(result.value.properties);
          if (parsedProperties.isErr()) {
            return [];
          }
          return {
            ...result.value,
            properties: parsedProperties.value,
          };
        })
      );
    }
  }
  return ok(value);
}

export function parseUserProperty(
  definition: UserPropertyDefinition,
  value: string
): Result<JSONValue, Error> {
  const parsed = jsonParseSafe(value);
  if (parsed.isErr()) {
    return ok(value);
  }
  const processed = processUserProperty(definition, parsed.value);
  if (processed.isErr()) {
    return err(processed.error);
  }
  return ok(processed.value);
}
