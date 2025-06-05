import { FormatRegistry } from "@sinclair/typebox";
import { isFloat, isNaturalNumber } from "isomorphic-lib/src/strings";

export function registerFormats() {
  FormatRegistry.Set("naturalNumber", isNaturalNumber);
  FormatRegistry.Set("float", isFloat);
}
