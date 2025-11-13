# Not Exists Segment Debug

## Background

Segments are sets of users that match a set of criteria. This criteri is defined with a JSON dsl. This criteria defines a set of traits or behaviors that a user must have or not have to be in the segment.

These segment assignments are calculated and stored in clickhouse, where the relevant file is packages/backend-lib/src/computedProperties/computePropertiesIncremental.ts. For more insight into the behavior of the segments see packages/backend-lib/src/computedProperties/computePropertiesIncremental.test.ts.

## Symptoms

There's an issue in the NotEquals segment operator. It appears, in production, to contain users that should not be in the segment. The affected users have received an identify event with a non-empty trait value at the specified path, and so should not be in the segment, but are.
