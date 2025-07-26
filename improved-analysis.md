# Improved Analysis

## Problem Statement

We're building Dittofeed, an open-source customer engagement platform. It's an alternative to platforms like Braze, Customer.io, and Iterable.

I'm in the process of building a new analysis page for the dashboard. I'd like assistance with designing the page then implementing it. I'd like to implement a solution that provides most of the functionality available in other, equivalent applications.

## Proposed UX

- The top left corner should have:
    - a date range selector.
    - a group by selector.
    - and a filter selector.
- The top right corner should have a:
    - refresh button
    - button to auto-refresh
    - button to export/download data (CSV)
    - a button to toggle between percentages and absolute values

- filter and group by should be dropdowns with the following options:
    - journeys
        - can further filter by template
    - broadcasts
    - channel
    - provider
    - message state (delivered, opened etc.)
- selecting a provider that is unique to a specific channel should automatically select that channel
- the body of the page should be split vertically into two sections:
    - the top half should have a chart
    - the bottom half should have a table
        - the table should have a header with a toggle button to select whether to display the raw related events (individual message status updates, unsubscribes, etc.), or the the "deliveries" (i.e. for any particular message, its status, contents etc.)

### Sample Layout

+--------------------------------------------------------------------------------------------------+
| Dittofeed Analysis                                                                               |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|  Date Range: [ Jul 1, 2025 - Jul 25, 2025 v ]               (↻) Auto-Refresh [ ] (↓) Export CSV  |
|  Compare to: [ (Optional) Previous Period v ]                                                    |
|                                                                                                  |
|  Group By: [ Journey                      v ]                                                    |
|                                                                                                  |
|  Filters:  [ Channel is Email x ] [ + Add Filter ]                                               |
|                                                                                                  |
+------------------------------------------------------------------+-------------------------------+
|   [• Values ] [  %   ]                                           |                               |
|   Performance over Time                                          |            Legend             |
|                                                                  |   -------------------------   |
|   1.5K | . . . . . . . . . . . . . .* . . . . . . . . . . . . . . |   [>] Welcome Series (*)      |
|        | . . . . . . . . . . . . * . . .* . . . . . . . . . . . . |   [>] Onboarding Funnel (~)   |
|   1.0K | ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~*~ ~ ~ ~ ~ *~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ |   [>] Re-engagement (-)       |
|        | . . . . . . . . . . * . . . . . . .* . . . . . . . . . . |                               |
|    500 | - - - - - - -*~ ~ ~-~-~-~-~-~-~-~*~-~-~-~-~-~-~-~-~- - - |                               |
|        | . . . . . . * . . . . . . . . . . . * . . . . . . . . .  |                               |
|      0 +----------------------------------------------------------+                               |
|          Jul 1      Jul 7       Jul 14      Jul 21      Jul 25   |                               |
+------------------------------------------------------------------+-------------------------------+
|                                                                                                  |
|   +-----------------+  +-----------------+  +-----------------+  +-----------------+             |
|   |   DELIVERIES    |  |      OPENS      |  |      CLICKS     |  |     BOUNCES     |             |
|   |     32,481      |  |      7,890      |  |      1,002      |  |       102       |             |
|   +-----------------+  +-----------------+  +-----------------+  +-----------------+             |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|   [• Message Summary ] [ Event Log ]                                                             |
|                                                                                                  |
|   +----------------------+--------------------------+-----------+-----------------------------+  |
|   | Timestamp            | Recipient                | Status    | Journey / Template          |  |
|   +----------------------+--------------------------+-----------+-----------------------------+  |
|   | 2025-07-25 13:37:00  | user1@example.com        | DELIVERED | Welcome Series              |  |
|   | 2025-07-25 13:36:10  | user2@example.com        | OPENED    | Welcome Series              |  |
|   | 2025-07-24 09:15:22  | user3@example.com        | CLICKED   | Onboarding Funnel           |  |
|   | ...                  | ...                      | ...       | ...                         |  |
|   +----------------------+--------------------------+-----------+-----------------------------+  |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+

- note that the art above includes a compare to feature, but this will be saved for a later iteration.

## Choice of libraries

- you should use tanstack query and axios for data fetching
    - see packages/dashboard/src/lib/useSegmentsQuery.ts and packages/dashboard/src/lib/useUpdateSegmentsMutation.ts as examples
- we're going to use recharts for charting

## Useful Commands

- `yarn workspace backend-lib check` to check the backend lib for type errors
- `yarn workspace dashboard check` to check the dashboard for type errors, where the backend lib is a dependency and will be checked transitively
- `yarn workspace dashboard lint --fix` to list and fix linting errors in the dashboard
- `yarn jest packages/backend-lib/src/analysis.test.ts` to run  our new tests

## Relevant References

- packages/backend-lib/src/userEvents.ts to see how user events can be fetched from clickhouse
- packages/backend-lib/src/deliveries.ts to see how deliveries can be fetched from clickhouse
- packages/backend-lib/src/db/schema.ts to see our postgres schema
- packages/backend-lib/src/userEvents/clickhouse.ts to see our clickhouse schema

## Steps

### Stage 1 Backend

- create new backend method in packages/backend-lib/src/analysis.ts getChartData
    - this and other methods should use typebox schema defined types for their parameters and return values, see packages/backend-lib/src/segments.ts as an example
    - this method should also accept a "granularity" parameter of "auto", 30 second, 1 minute, 5 minutes, 10 minutes, 30 minutes, 1 hour, 6 hours, 12 hours, 1 day, 7 days, 30 days
    - this granularity should be used to prevent the api from having to load all data into memory at once, overloading the api or ui.
    - within a given granularity, the api should return the total number of events i.e. as a form of chunking, or bucketing.
- create a new test in packages/backend-lib/src/analysis.test.ts for getChartData
- create a new method in packages/backend-lib/src/analysis.ts getSummarizedData
    - this is used to represent the summary row between the chart and the table
- create a new test in packages/backend-lib/src/analysis.test.ts for getSummarizedData
- add a new analysis controller. use packages/api/src/controllers/segmentsController.ts as an example
- add controller to router packages/api/src/buildApp/router.ts
