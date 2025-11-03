# Add Deliveries Count

The purpose of this task is to add the deliveries count to the deliveries table component.

Ensure that when you want to use typechecking or run tests, use the commands defined in [AGENTS](./agents.md).

## Steps

1. Add a new `searchDeliveriesCount` function to the `packages/backend-lib/src/deliveries.ts` file.
  - It should re-use as much code from the existing `searchDeliveries` function as possible, producing the unpaginated count of deliveries.
  - This should be accomplished by abstracting out `buildDeliverySearchQuery` into a new function `buildDeliverySearchQueryBody`, that produces the same query but without the SELECT clause, or the pagination clauses.
  - The `searchDeliveriesCount` function should then use the `buildDeliverySearchQueryBody`, and the existing `buildDeliverySearchQuery` method can be built on top of it.
2. Add a new test to the `packages/backend-lib/src/deliveries.test.ts` file to test the new `searchDeliveriesCount` function.
3. Create a new endpoint `packages/api/src/controllers/deliveriesController.ts`.
4. Update `packages/dashboard/src/components/deliveriesTableV2/deliveriesBody.tsx` to use the new count endpoint.
    - Implement the logic using tanstack query in a similar way to the existing deliveries query.
    - The count should be displayed in the lower right corner of the table.