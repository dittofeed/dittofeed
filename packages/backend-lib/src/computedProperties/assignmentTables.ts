import config from "../config";
import {
  COMPUTED_PROPERTY_ASSIGNMENTS_CURRENT_TABLE,
  COMPUTED_PROPERTY_ASSIGNMENTS_TABLE,
} from "../userEvents/clickhouse";

export function computedPropertyAssignmentsReadTable(): string {
  return config().readComputedPropertyAssignmentsFromCurrent
    ? COMPUTED_PROPERTY_ASSIGNMENTS_CURRENT_TABLE
    : COMPUTED_PROPERTY_ASSIGNMENTS_TABLE;
}

export function computedPropertyAssignmentsWriteQueries(
  query: string,
): string[] {
  if (
    !config().writeComputedPropertyAssignmentsCurrent ||
    !/^\s*insert\s+into\s+/i.test(query)
  ) {
    return [query];
  }
  const currentQuery = query.replace(
    COMPUTED_PROPERTY_ASSIGNMENTS_TABLE,
    COMPUTED_PROPERTY_ASSIGNMENTS_CURRENT_TABLE,
  );
  return [query, currentQuery];
}
