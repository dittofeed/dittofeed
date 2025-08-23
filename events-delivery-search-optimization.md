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

## Analysis of Current Implementation

After analyzing the codebase, I've identified the following performance bottlenecks:

### Current Issues
1. **JSON Parsing at Query Time**: Both `findManyEventsWithCount` and `searchDeliveries` use `JSONExtract` functions to parse the `properties` field during query execution
2. **Frequently Extracted Fields**: The most commonly extracted properties across the codebase are:
   - `templateId` - Used for filtering messages by template
   - `broadcastId` - Used for filtering broadcast messages
   - `journeyId` - Used for filtering journey-based messages
   - `triggeringMessageId` - Used for delivery tracking
   - `variant.type` (channel) - Used for filtering by channel type
   - `variant.to` and `variant.from` - Used for delivery searches

3. **Complex Aggregations**: The `searchDeliveries` function performs complex GROUP BY operations after parsing JSON, which compounds the CPU cost

## Proposed Solutions

### Solution 1: Add Materialized Columns to Existing Table (Recommended)

Add new columns to `user_events_v2` with DEFAULT expressions that extract commonly used fields at insert time:

```sql
ALTER TABLE user_events_v2 
ADD COLUMN template_id String DEFAULT JSONExtractString(properties, 'templateId'),
ADD COLUMN broadcast_id String DEFAULT JSONExtractString(properties, 'broadcastId'),
ADD COLUMN journey_id String DEFAULT JSONExtractString(properties, 'journeyId'),
ADD COLUMN triggering_message_id String DEFAULT JSONExtractString(properties, 'triggeringMessageId'),
ADD COLUMN channel_type String DEFAULT JSON_VALUE(properties, '$.variant.type'),
ADD COLUMN delivery_to String DEFAULT JSON_VALUE(properties, '$.variant.to'),
ADD COLUMN delivery_from String DEFAULT JSON_VALUE(properties, '$.variant.from');

-- Add skip indexes for efficient filtering
ALTER TABLE user_events_v2
ADD INDEX idx_template_id template_id TYPE bloom_filter(0.01) GRANULARITY 4,
ADD INDEX idx_broadcast_id broadcast_id TYPE bloom_filter(0.01) GRANULARITY 4,
ADD INDEX idx_journey_id journey_id TYPE bloom_filter(0.01) GRANULARITY 4;
```

**Advantages:**
- Minimal code changes required - queries can gradually migrate to use new columns
- No data duplication - columns are computed on write
- Existing data can be backfilled using lightweight mutations
- Skip indexes provide efficient filtering without changing sort order

**Disadvantages:**
- Increases storage slightly (materialized columns are stored)
- Increases write complexity marginally

### Solution 2: Create a Materialized View for Deliveries

Create a specialized materialized view optimized for delivery searches:

```sql
CREATE MATERIALIZED VIEW deliveries_mv
ENGINE = AggregatingMergeTree()
ORDER BY (workspace_id, sent_at, user_or_anonymous_id, origin_message_id)
AS SELECT
  workspace_id,
  user_or_anonymous_id,
  anyIf(message_id, event = 'DFInternalMessageSent') as origin_message_id,
  JSONExtractString(properties, 'triggeringMessageId') as triggering_message_id,
  JSONExtractString(properties, 'templateId') as template_id,
  JSONExtractString(properties, 'broadcastId') as broadcast_id,
  JSONExtractString(properties, 'journeyId') as journey_id,
  JSON_VALUE(properties, '$.variant.type') as channel_type,
  JSON_VALUE(properties, '$.variant.to') as delivery_to,
  JSON_VALUE(properties, '$.variant.from') as delivery_from,
  minIf(event_time, event = 'DFInternalMessageSent') as sent_at,
  max(event_time) as updated_at,
  argMaxState(event, event_time) as last_event_state,
  anyState(properties) as properties_state
FROM user_events_v2
WHERE event IN [/* list of delivery events */]
GROUP BY workspace_id, user_or_anonymous_id, origin_message_id;
```

**Advantages:**
- Optimized specifically for delivery queries
- Pre-aggregated data reduces query complexity
- Can have different sort order optimized for common access patterns

**Disadvantages:**
- Data duplication increases storage costs
- More complex to maintain - requires updating both tables
- Requires significant code changes

### Solution 3: Hybrid Approach with Projection

Use ClickHouse projections to create an alternative storage layout:

```sql
ALTER TABLE user_events_v2 ADD PROJECTION delivery_projection (
  SELECT 
    workspace_id,
    user_or_anonymous_id,
    message_id,
    event,
    event_time,
    processing_time,
    JSONExtractString(properties, 'templateId') as template_id,
    JSONExtractString(properties, 'broadcastId') as broadcast_id,
    JSONExtractString(properties, 'journeyId') as journey_id,
    properties
  ORDER BY workspace_id, template_id, broadcast_id, journey_id, processing_time
);
```

**Advantages:**
- ClickHouse automatically chooses the best projection for queries
- No code changes required
- Data consistency guaranteed

**Disadvantages:**
- Increases storage requirements
- Limited flexibility in projection definition
- May not be used for all query patterns

## Implementation Recommendations

### Recommended Approach: Solution 1 with Phased Migration

Based on the analysis, I recommend **Solution 1 (Add Materialized Columns)** as the primary approach, with the following implementation strategy:

#### Phase 1: Add Columns with DEFAULT Expressions
1. Add new columns using ALTER TABLE with DEFAULT expressions
2. These columns will be populated automatically for new data
3. Use lightweight mutations to backfill existing data in batches

#### Phase 2: Add Skip Indexes
1. After columns are populated, add bloom filter indexes for the most frequently filtered columns
2. Consider using `ngrambf_v1` indexes for partial string matching if needed

#### Phase 3: Migrate Queries
1. Update `findManyEventsWithCount` to use the new columns instead of JSONExtract
2. Update `searchDeliveries` to leverage the indexed columns
3. Monitor query performance improvements

### Performance Impact Analysis

#### Expected Improvements
- **Query Performance**: 5-10x improvement in query speed for filtered queries
- **CPU Usage**: 70-90% reduction in CPU usage for JSON parsing
- **Memory Usage**: Slight reduction due to less temporary data during query execution

#### Storage Impact
- **Additional Storage**: ~15-20% increase for the new columns
- **Index Storage**: ~2-5% additional for bloom filter indexes

### Alternative Considerations

If Solution 1 doesn't provide sufficient performance improvements, consider:

1. **Partial Materialized View**: Create a materialized view only for the most recent data (e.g., last 30 days)
2. **Tiered Storage**: Move older events to a different table with a different schema
3. **Distributed Processing**: Use ClickHouse's distributed tables for horizontal scaling

## Migration Strategy

### Step-by-Step Migration Plan

1. **Testing Environment**
   - Implement changes in a test environment first
   - Benchmark query performance before and after changes
   - Validate data consistency

2. **Production Rollout**
   - Add columns during low-traffic periods
   - Backfill data in batches to avoid system overload
   - Monitor system metrics during migration

3. **Code Updates**
   - Update queries to use new columns with feature flags
   - Gradually roll out to a percentage of queries
   - Monitor for any issues or performance regressions

### Rollback Plan

If issues arise:
1. Queries can immediately revert to using JSONExtract
2. New columns can be dropped without data loss
3. The original `properties` field remains unchanged

## Best Practices and ClickHouse Recommendations

### ClickHouse Best Practices Applied

1. **Compute on Write**: Pre-computing values at insert time is more efficient than compute-on-read
2. **Skip Indexes**: Bloom filters are ideal for columns with moderate cardinality (like templateId, journeyId)
3. **Column Types**: Using `LowCardinality(String)` for columns with limited unique values can improve compression
4. **DEFAULT vs MATERIALIZED**: DEFAULT columns are preferred as they don't take space for NULL values

### Monitoring and Optimization

After implementation, monitor:
- Query execution time via `system.query_log`
- Index effectiveness via `system.data_skipping_indices`
- Storage usage via `system.parts`
- CPU and memory usage during peak query times

## Query Optimization Examples

### Before Optimization (Current State)

```sql
-- findManyEventsWithCount current query (simplified)
SELECT
  *,
  if(
    properties != '',
    JSONExtract(properties, 'Tuple(broadcastId String, journeyId String)'),
    CAST(('', ''), 'Tuple(broadcastId String, journeyId String)')
  ) AS parsed_properties
FROM user_events_v2
WHERE
  workspace_id = 'workspace123'
  AND JSONExtractString(properties, 'broadcastId') = 'broadcast456'  -- CPU intensive
  AND JSONExtractString(properties, 'journeyId') = 'journey789'      -- CPU intensive
```

### After Optimization

```sql
-- findManyEventsWithCount optimized query
SELECT
  *,
  broadcast_id,
  journey_id
FROM user_events_v2
WHERE
  workspace_id = 'workspace123'
  AND broadcast_id = 'broadcast456'  -- Direct column access with bloom filter
  AND journey_id = 'journey789'      -- Direct column access with bloom filter
```

### Delivery Search Optimization

```sql
-- searchDeliveries before (simplified inner query)
SELECT
  ...,
  JSONExtractString(properties, 'templateId') as template_id,
  JSONExtractString(properties, 'broadcastId') as broadcast_id,
  JSON_VALUE(properties, '$.variant.type') as channel_type
FROM user_events_v2
WHERE
  event IN [...]
  AND JSONExtractString(properties, 'broadcastId') = 'broadcast456'  -- Scans all rows

-- searchDeliveries after
SELECT
  ...,
  template_id,      -- Direct column access
  broadcast_id,     -- Direct column access  
  channel_type      -- Direct column access
FROM user_events_v2
WHERE
  event IN [...]
  AND broadcast_id = 'broadcast456'  -- Uses bloom filter index
```

## High Level Goals

- The number 1 most important goal is to make the `searchDeliveries` and `findManyEventsWithCount` functions fast, by improving their query CPU usage.
- The table `user_events_v2` is the most frequently written to table in the database, so writes should not be made overly expensive.
- Solutions should be prioritized based on how conventional they are based on ClickHouse community recommendations. Frequent consultation of the web for the purpose of establishing best practices is encouraged.
