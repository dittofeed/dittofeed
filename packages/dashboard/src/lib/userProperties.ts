import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  LeafUserPropertyDefinition,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
} from "isomorphic-lib/src/types";

const DEFAULT_FILE_EXAMPLE = `{
  "type": "BlobStorage",
  "key": "my_file_name.pdf",
  "mimeType": "application/pdf"
}`;

const DEFAULT_PERFORMED_EXAMPLE = `{
  "key1": "value1",
  "key2": "value2"
}`;

export function getDefaultUserPropertyExampleValue(
  definition: UserPropertyDefinition,
): string {
  switch (definition.type) {
    case UserPropertyDefinitionType.Id:
      return '"7593a88-feb4-4777-8273-2fc3077708df"';
    case UserPropertyDefinitionType.AnonymousId:
      return '"ba4facaf-5a84-44d1-b601-9e51e9f91b1c"';
    case UserPropertyDefinitionType.Trait:
      return '"myTraitValue"';
    case UserPropertyDefinitionType.Performed:
      return DEFAULT_PERFORMED_EXAMPLE;
    case UserPropertyDefinitionType.File:
      return DEFAULT_FILE_EXAMPLE;
    case UserPropertyDefinitionType.Group: {
      let firstNonParentNode: LeafUserPropertyDefinition | null = null;
      for (const node of definition.nodes) {
        if (node.type !== UserPropertyDefinitionType.AnyOf) {
          firstNonParentNode = node;
          break;
        }
      }
      if (!firstNonParentNode) {
        return "";
      }
      return getDefaultUserPropertyExampleValue(firstNonParentNode);
    }
    case UserPropertyDefinitionType.PerformedMany:
      throw new Error("Not implemented");
    // FIXME
    case UserPropertyDefinitionType.KeyedPerformed:
      throw new Error("Not implemented");
    default:
      assertUnreachable(definition);
  }
}
