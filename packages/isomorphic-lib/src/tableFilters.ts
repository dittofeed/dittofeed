import { Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

// Generic "advanced" filters shared by dashboard tables. A table declares which
// fields it supports and the backend maps each field to a vetted column
// expression, so field names coming from the client are never interpolated.

export const TableFilterOperatorEnum = {
  Equals: "Equals",
  NotEquals: "NotEquals",
  Contains: "Contains",
  NotContains: "NotContains",
  In: "In",
  NotIn: "NotIn",
  GreaterThan: "GreaterThan",
  LessThan: "LessThan",
  Between: "Between",
  IsEmpty: "IsEmpty",
  IsNotEmpty: "IsNotEmpty",
} as const;

export const TableFilterOperator = Type.KeyOf(
  Type.Const(TableFilterOperatorEnum),
);

export type TableFilterOperator = Static<typeof TableFilterOperator>;

export const TableFilterFieldTypeEnum = {
  String: "String",
  Number: "Number",
  Date: "Date",
  Enum: "Enum",
} as const;

export type TableFilterFieldType = keyof typeof TableFilterFieldTypeEnum;

export const TableFilter = Type.Object({
  field: Type.String(),
  operator: TableFilterOperator,
  // Single value for scalar operators, list for In/NotIn, [min, max] for
  // Between, omitted for IsEmpty/IsNotEmpty.
  value: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
});

export type TableFilter = Static<typeof TableFilter>;

export const TableFilters = Type.Array(TableFilter);

export type TableFilters = Static<typeof TableFilters>;

export const TABLE_FILTER_OPERATORS_BY_TYPE: Record<
  TableFilterFieldType,
  TableFilterOperator[]
> = {
  String: [
    "Equals",
    "NotEquals",
    "Contains",
    "NotContains",
    "IsEmpty",
    "IsNotEmpty",
  ],
  Number: ["Equals", "NotEquals", "GreaterThan", "LessThan", "Between"],
  Date: ["GreaterThan", "LessThan", "Between"],
  Enum: ["In", "NotIn"],
};

export const TABLE_FILTER_OPERATOR_LABELS: Record<TableFilterOperator, string> =
  {
    Equals: "=",
    NotEquals: "≠",
    Contains: "contains",
    NotContains: "does not contain",
    In: "is any of",
    NotIn: "is none of",
    GreaterThan: ">",
    LessThan: "<",
    Between: "between",
    IsEmpty: "is empty",
    IsNotEmpty: "is not empty",
  };

export function tableFilterValues(filter: TableFilter): string[] {
  if (filter.value === undefined) {
    return [];
  }
  return Array.isArray(filter.value) ? filter.value : [filter.value];
}

// Filters are stored in the page URL as a single JSON query param so filtered
// views can be bookmarked and shared.
export function serializeTableFilters(filters: TableFilters): string | null {
  if (filters.length === 0) {
    return null;
  }
  return JSON.stringify(filters);
}

export function parseTableFilters(raw: unknown): TableFilters {
  if (typeof raw !== "string" || raw.length === 0) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  return Value.Check(TableFilters, parsed) ? parsed : [];
}
