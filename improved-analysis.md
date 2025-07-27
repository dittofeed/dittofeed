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
- `yarn workspace admin-cli check` to check the admin cli for type errors, where the backend lib is a dependency and will be checked transitively
- `yarn workspace dashboard lint --fix` to list and fix linting errors in the dashboard
- `yarn jest packages/backend-lib/src/analysis.test.ts` to run  our new tests

## Coding Guidelines

- never use the `any` type, type assertions, or non-null assertions. if you find yourself using these, please ask for clarification.
- in general, if you find yourself re-writing code 2-3 times and struggling, please ask for assistance.

## Additional Relevant References

### Backend

- packages/backend-lib/src/userEvents.ts to see how user events can be fetched from clickhouse
- packages/backend-lib/src/deliveries.ts to see how deliveries can be fetched from clickhouse
- packages/backend-lib/src/db/schema.ts to see our postgres schema
- packages/backend-lib/src/userEvents/clickhouse.ts to see our clickhouse schema

### Frontend

- packages/dashboard/src/components/userEventsTable.tsx to see how we can construct date range selectors
- packages/dashboard/src/components/userEvents/userEventsFilter.tsx to see how we can construct filter selectors

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

### Stage 2 Frontend - Chart

- Create a new component in packages/dashboard/src/components/analysisChart.tsx
    - Initially, this chart should implement a date range selector, and the refresh button, but none of the other controls or functionality beyond the line chart itself.
    - This chart should implement a legend
    - Should include a new hook for querying the chart data.
- Create a script in packages/admin-cli/src/commandDefinitions.ts called seed-delivery-events.
    - This script should have a parameter called --scenario or -s for short which should prepare a preset collection of events to write to clickhouse.
    - The purpose of this script is to allow me to visually inspect the chart's UI as its developed. 
    - The initial scenario, which we'll call "basic-email", will 10 message send events to 10 different users. Those users will also have the following events:
        - 1 will have a spam report 
        - 1 will have a bounce
        - 3 will have an open but no click
        - 2 will have an open and a click 
        - 3 will have no additional events beyond the send event
    - To get a sense of how this event data will be structured take a look at packages/backend-lib/src/deliveries.test.ts .
- Create a new component in packages/dashboard/src/components/analysisChart/analysisChartFilters.tsx
    - This component should allow filters to be applied to the chart, as described above.
- Add group by functionality to the chart in packages/dashboard/src/components/analysisChart/analysisChartGroupBy.tsx

### Stage 3 Frontend - Summary Panel

- We're going to create a new component in packages/dashboard/src/components/analysisChart/analysisSummaryPanel.tsx
- This component will use the getSummarizedData method to fetch the summary data for the chart.
- It will look like the middle section of the sample layout above between the chart and the table.
- It will by default only contain the message sent values when no channel filter is selected.
    - In this case it should also display a message saying "Select a channel to see a detailed summary."
    - Adjacent to this message should be two buttons: email and sms, which if clicked will update the filter to only show the selected channel.

### Stage 4 Backend - getChartData corrections

- the getChartData method in packages/backend-lib/src/analysis.ts has several logical errors and in this task we will correct them along with the tests in packages/backend-lib/src/analysis.test.ts
- the return / response type of the method is wrong in that it includes "deliveries" and "sent"
    - there should be instead be a single field called "count"
    - in the case that we are grouping by message state, the counts will be dissagregated for each state value including sent and delivered, but absent that grouping the counts will be aggregated for all states
- in some cases a state should be "double counted"
    - for example, an opened event should be counted as a delivery, and a click event should be counted as an open and a delivery
    - while a click event should be counted as a delivery, if the original message already has an explicit open event, then the click event should not be counted as an additional delivery i.e. each message should count at most one status value per state (one click, one open, one delivery)
- the inner query includes email bounced events, but excludes sms failed events which are the logical equivalent
- the query is looking up resource names for e.g. broadcasts, journeys, templates, etc. but this is out of scope for this method, and we should simply pass the ids

### Stage 5 Add the Deliveries Table

We're going to add the deliveries table to the analysis page. However, in order to do that we're going to need to abstract out the logic for its controls, so that we can reuse the controls at the top of the page.

For example, the existing date range selector, and channel filters' values should be passed into the deliveries table (packages/dashboard/src/components/deliveriesTableV2.tsx).

- Create a new component packages/dashboard/src/components/deliveriesTableV2/deliveriesBody.tsx
- Refactor the deliveries table body into this new component
- Use this component in packages/dashboard/src/components/deliveriesTableV2.tsx
- Use this component in packages/dashboard/src/components/analysisChart.tsx
