import { FormatRegistry } from "@sinclair/typebox";
import { isNaturalNumber } from "isomorphic-lib/src/strings";

export function registerFormats() {
  FormatRegistry.Set("naturalNumber", isNaturalNumber);
}
