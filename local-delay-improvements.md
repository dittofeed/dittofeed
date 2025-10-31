# Local Delay Improvements

See [AGENTS.md](AGENTS.md) for for general coding guidelines. 

## Add Optional Default Timezone to Local User Property Delay Nodes

### Backend Implementation

Steps:

1. Modify `LocalTimeDelayVariant` to add `defaultTimezone` field, which is optional.
2. Modify `findNextLocalizedTimeV2` and its inner functions to use this field to select a timezone if none is provided from the user property.
3. Ensure `userWorkflow.ts` uses the new parameter, and passes through the journey's value.
4. Write a test in dates.test.ts to ensure the new parameter is used correctly.
5. Write a more end-to-end test in `packages/backend-lib/src/journeys/keyedEventEntry.test.ts` to ensure a local delay node can use a default timezone correctly. 

### Frontend Implementation

Modify packages/dashboard/src/components/journeys/nodeEditor.tsx to add a field for selecting a default timezone. Reuse the implementation of the timezone autocomplete component in `packages/dashboard/src/components/timezoneAutocomplete.tsx`.