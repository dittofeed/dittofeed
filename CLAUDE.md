I want to add filters to my packages/dashboard/src/components/userEventsTable.tsx component.

They should be equivalent to those found in packages/dashboard/src/components/deliveriesTableV2.tsx, and packages/dashboard/src/components/deliveries/deliveriesFilter.tsx in appearance and ux.

They should allow the user to filter by:
- `event` - "Event Name"
- `broadcastId` - "Broadcast"
- `journeyId` - "Journey"
- `eventType` - "Event Type"
- `messageId` - "Message ID"
- `userId` - "User ID"

See as a reference for the backend implementation of the relevant api call packages/backend-lib/src/userEvents.ts and its related parameters.

Like the deliveries filters, it should have a concept of hardcoded filters that are specified on page load and which are not-deselectable.
