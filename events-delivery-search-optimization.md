# Events and Delivery Search Optimization

## Background

I have a table with user events. These tables are held in ClickHouse. The data is modeled as a typical CDP, like e.g. segment.io's, with `identify` and `track` events.

The structure of these tables are represented in `packages/backend-lib/src/userEvents/clickhouse.ts`, with the critical table being defined as follows:

```sql
CREATE TABLE IF NOT EXISTS user_events_v2 (
  event_type Enum(
    'identify' = 1,
    'track' = 2,
    'page' = 3,
    'screen' = 4,
    'group' = 5,
    'alias' = 6
  ) DEFAULT JSONExtract(
    message_raw,
    'type',
    'Enum(\\'identify\\' = 1, \\'track\\' = 2, \\'page\\' = 3, \\'screen\\' = 4, \\'group\\' = 5, \\'alias\\' = 6)'
  ),
  event String DEFAULT JSONExtract(
    message_raw,
    'event',
    'String'
  ),
  event_time DateTime64 DEFAULT assumeNotNull(
    parseDateTime64BestEffortOrNull(
      JSONExtractString(message_raw, 'timestamp'),
      3
    )
  ),
  message_id String,
  user_id String DEFAULT JSONExtract(
    message_raw,
    'userId',
    'String'
  ),
  anonymous_id String DEFAULT JSONExtract(
    message_raw,
    'anonymousId',
    'String'
  ),
  user_or_anonymous_id String DEFAULT assumeNotNull(
    coalesce(
      JSONExtract(message_raw, 'userId', 'Nullable(String)'),
      JSONExtract(message_raw, 'anonymousId', 'Nullable(String)')
    )
  ),
  properties String DEFAULT assumeNotNull(
    coalesce(
      JSONExtract(message_raw, 'traits', 'Nullable(String)'),
      JSONExtract(message_raw, 'properties', 'Nullable(String)')
    )
  ),
  processing_time DateTime64(3) DEFAULT now64(3),
  server_time DateTime64(3),
  message_raw String,
  workspace_id String,
  INDEX message_id_idx message_id TYPE minmax GRANULARITY 4
)
ENGINE = MergeTree()
ORDER BY (
  workspace_id,
  processing_time,
  user_or_anonymous_id,
  event_time,
  message_id
);
```

As you can see, the `properties` field is a JSON string, which duplicates the data held in the `message_raw` field.

## The Problem

The problem we have at hand is to optimize the following functions:

- `findManyEventsWithCount` in `packages/backend-lib/src/userEvents.ts`
- `searchDeliveries` in `packages/backend-lib/src/deliveries.ts`

Note that "deliveries" are essentially an abstracton over user events. They are defined by `DFInternalMessageSent` events whose statuses are optionally updated by subsequent status update events.

The reason these functions are inefficient today is that that we frequently need to filter events, or derived deliveries, by properties. Examples of such properties are:

- `templateId`
- `broadcastId`
- `journeyId`

These properties are stored in the `properties` field of the `user_events_v2` table, for many events.

However, when workspaces contain many large events within a short time period, simply parsing the JSON in order to filter by these properties is CPU bound and is too slow.

## Possible Solutions

- add new columns to the `user_events_v2` table, e.g. `templateId`, `broadcastId`, `journeyId` that are pre-parsed from the `properties` field at write time.
- create a new table that is a materialized view of the `user_events_v2` table, with the new columns, along with a sort key that allows for efficient filtering, and joining on the `user_events_v2` table.
- we may wan to create one or more skip indexes on either the `user_events_v2` table, or the new table, to allow for efficient filtering on the parsed `properties` fields.