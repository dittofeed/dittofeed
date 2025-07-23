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
    - button to export data (CSV)
    - a button to toggle between percentages and absolute values

- filter and group by should be dropdowns with the following options:
    - journeys
        - can further filter by template
    - broadcasts
    - channel
    - provider
    - message state (delivered, opened etc.)
- note that some journey filters availability should be conditional on prior selected filters.
    - e.g. provider should only be available if a particular channel is selected 

## Choice of libraries

- you should use tanstack query and axios for data fetching
    - see packages/dashboard/src/lib/useSegmentsQuery.ts and packages/dashboard/src/lib/useUpdateSegmentsMutation.ts as examples

## Steps
 - create new backend method