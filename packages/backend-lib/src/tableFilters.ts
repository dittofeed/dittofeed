import {
  TABLE_FILTER_OPERATORS_BY_TYPE,
  TableFilter,
  TableFilterFieldType,
  TableFilters,
  tableFilterValues,
} from "isomorphic-lib/src/tableFilters";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";

import { ClickHouseQueryBuilder } from "./clickhouse";
import logger from "./logger";

export interface ClickHouseTableFilterField {
  // Vetted ClickHouse expression. Never derived from user input.
  expr: string;
  type: TableFilterFieldType;
}

export type ClickHouseTableFilterFields = Record<
  string,
  ClickHouseTableFilterField
>;

function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidDate(value: string | undefined): value is string {
  return value !== undefined && !Number.isNaN(Date.parse(value));
}

function buildCondition({
  filter,
  field,
  qb,
}: {
  filter: TableFilter;
  field: ClickHouseTableFilterField;
  qb: ClickHouseQueryBuilder;
}): string | null {
  const { expr, type } = field;
  const values = tableFilterValues(filter);
  const [first, second] = values;

  switch (filter.operator) {
    case "Equals":
    case "NotEquals": {
      const op = filter.operator === "Equals" ? "=" : "!=";
      if (type === "Number") {
        const num = parseNumber(first);
        return num === null
          ? null
          : `${expr} ${op} ${qb.addQueryValue(num, "Float64")}`;
      }
      return first === undefined
        ? null
        : `${expr} ${op} ${qb.addQueryValue(first, "String")}`;
    }
    case "Contains":
    case "NotContains": {
      if (!first) {
        return null;
      }
      const op = filter.operator === "Contains" ? ">" : "=";
      return `positionCaseInsensitiveUTF8(${expr}, ${qb.addQueryValue(first, "String")}) ${op} 0`;
    }
    case "In":
    case "NotIn": {
      if (values.length === 0) {
        return null;
      }
      const op = filter.operator === "In" ? "IN" : "NOT IN";
      return `${expr} ${op} ${qb.addQueryValue(values, "Array(String)")}`;
    }
    case "GreaterThan":
    case "LessThan": {
      const op = filter.operator === "GreaterThan" ? ">" : "<";
      if (type === "Date") {
        return isValidDate(first)
          ? `${expr} ${op} parseDateTimeBestEffort(${qb.addQueryValue(first, "String")}, 'UTC')`
          : null;
      }
      const num = parseNumber(first);
      return num === null
        ? null
        : `${expr} ${op} ${qb.addQueryValue(num, "Float64")}`;
    }
    case "Between": {
      if (type === "Date") {
        return isValidDate(first) && isValidDate(second)
          ? `${expr} BETWEEN parseDateTimeBestEffort(${qb.addQueryValue(first, "String")}, 'UTC') AND parseDateTimeBestEffort(${qb.addQueryValue(second, "String")}, 'UTC')`
          : null;
      }
      const min = parseNumber(first);
      const max = parseNumber(second);
      return min === null || max === null
        ? null
        : `${expr} BETWEEN ${qb.addQueryValue(min, "Float64")} AND ${qb.addQueryValue(max, "Float64")}`;
    }
    case "IsEmpty":
      return `${expr} = ''`;
    case "IsNotEmpty":
      return `${expr} != ''`;
    default:
      assertUnreachable(filter.operator);
  }
}

// Translates advanced table filters into ClickHouse WHERE conditions, to be
// AND'ed together. Filters on unknown fields, unsupported operators, or with
// unparseable values are skipped rather than failing the whole query.
export function buildClickHouseTableFilterConditions({
  filters,
  fields,
  qb,
}: {
  filters: TableFilters | undefined;
  fields: ClickHouseTableFilterFields;
  qb: ClickHouseQueryBuilder;
}): string[] {
  if (!filters) {
    return [];
  }
  const conditions: string[] = [];
  for (const filter of filters) {
    // hasOwnProperty guards against names like "constructor" or "__proto__".
    const field = Object.prototype.hasOwnProperty.call(fields, filter.field)
      ? fields[filter.field]
      : undefined;
    if (
      !field ||
      !TABLE_FILTER_OPERATORS_BY_TYPE[field.type].includes(filter.operator)
    ) {
      logger().warn({ filter }, "Ignoring unsupported table filter");
      continue;
    }
    const condition = buildCondition({ filter, field, qb });
    if (condition) {
      conditions.push(condition);
    }
  }
  return conditions;
}
