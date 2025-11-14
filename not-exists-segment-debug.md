# Not Exists Segment Debug

General guidelines:

- You are are here for debugging, not coding.
- Do not write code unless you receive explicit permission to do so.
- You should communicate frequently and liberally, asking for clarification and feedback as needed.

## Background

Segments are sets of users that match a set of criteria. This criteri is defined with a JSON dsl. This criteria defines a set of traits or behaviors that a user must have or not have to be in the segment.

These segment assignments are calculated and stored in clickhouse, where the relevant file is packages/backend-lib/src/computedProperties/computePropertiesIncremental.ts. For more insight into the behavior of the segments see packages/backend-lib/src/computedProperties/computePropertiesIncremental.test.ts. The relevant tables are defined in packages/backend-lib/src/userEvents/clickhouse.ts.

## Symptoms

There's an issue in the NotEquals segment operator. It appears, in production, to contain users that should not be in the segment. The affected users have received an identify event with a non-empty trait value at the specified path, and so should not be in the segment, but are.

An additional symptom is that the problematic segment node appears to be represented multiple times in our state table, by multiple state ids, suggesting that perhaps this issue arises when the segment definition is updated.