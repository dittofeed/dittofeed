# Add Deliveries Count

The purpose of this task is to add the deliveries count to the deliveries table component.

## Steps

1. Add a new `searchDeliveriesCount` function to the `packages/backend-lib/src/deliveries.ts` file.
  - It should re-use as much code from the existing `searchDeliveries` function as possible, producing the unpaginated count of deliveries.
2. Create a new endpoint `packages/api/src/controllers/deliveriesController.ts`.
3. Update `packages/dashboard/src/components/deliveriesTableV2/deliveriesBody.tsx` to use the new count endpoint.
    - Implement the logic using tanstack query in a similar way to the existing deliveries query.
    - The count should be displayed in the lower right corner of the table.