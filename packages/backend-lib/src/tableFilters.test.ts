import { ClickHouseQueryBuilder } from "./clickhouse";
import {
  buildClickHouseTableFilterConditions,
  ClickHouseTableFilterFields,
} from "./tableFilters";

const FIELDS: ClickHouseTableFilterFields = {
  to: { expr: "delivery_to", type: "String" },
  channel: { expr: "channel_type", type: "Enum" },
  amount: { expr: "amount", type: "Number" },
  sentAt: { expr: "event_time", type: "Date" },
};

describe("buildClickHouseTableFilterConditions", () => {
  let qb: ClickHouseQueryBuilder;

  beforeEach(() => {
    qb = new ClickHouseQueryBuilder();
  });

  it("parameterizes string operators", () => {
    const conditions = buildClickHouseTableFilterConditions({
      qb,
      fields: FIELDS,
      filters: [
        { field: "to", operator: "Equals", value: "a@example.com" },
        { field: "to", operator: "NotContains", value: "test" },
        { field: "to", operator: "IsNotEmpty" },
      ],
    });
    expect(conditions).toEqual([
      "delivery_to = {v0:String}",
      "positionCaseInsensitiveUTF8(delivery_to, {v1:String}) = 0",
      "delivery_to != ''",
    ]);
    expect(qb.getQueries()).toEqual({ v0: "a@example.com", v1: "test" });
  });

  it("builds enum, number and date conditions", () => {
    const conditions = buildClickHouseTableFilterConditions({
      qb,
      fields: FIELDS,
      filters: [
        { field: "channel", operator: "NotIn", value: ["Email", "Sms"] },
        { field: "amount", operator: "Between", value: ["1", "10"] },
        {
          field: "sentAt",
          operator: "GreaterThan",
          value: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(conditions).toEqual([
      "channel_type NOT IN {v0:Array(String)}",
      "amount BETWEEN {v1:Float64} AND {v2:Float64}",
      "event_time > parseDateTimeBestEffort({v3:String}, 'UTC')",
    ]);
    expect(qb.getQueries()).toEqual({
      v0: ["Email", "Sms"],
      v1: 1,
      v2: 10,
      v3: "2026-01-01T00:00:00.000Z",
    });
  });

  it("skips unknown fields, disallowed operators and invalid values", () => {
    const conditions = buildClickHouseTableFilterConditions({
      qb,
      fields: FIELDS,
      filters: [
        { field: "delivery_to; DROP TABLE x", operator: "Equals", value: "a" },
        { field: "constructor", operator: "Equals", value: "a" },
        { field: "channel", operator: "Contains", value: "Em" },
        { field: "amount", operator: "GreaterThan", value: "abc" },
        { field: "sentAt", operator: "Between", value: ["not-a-date"] },
        { field: "channel", operator: "In", value: [] },
      ],
    });
    expect(conditions).toEqual([]);
    expect(qb.getQueries()).toEqual({});
  });
});
