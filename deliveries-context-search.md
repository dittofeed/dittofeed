## Goals

- Modify the submitBatch function so that individual event items can have their own context values
    - The context values should override top level context values sent with the batch.
- Modify batchMessageUsers so that context values can be added to each user item in the payload and propagated to the submitted events.
- Modify searchDeliveries so that it has a new contextValues parameter that can be used to filter deliveries by context values on the message sent event.
- Each step should be accompanied by new tests.

## General Guidelines

- Don't use unsafe typescript like `any`, type assertions, or non-null assertions.
- Logging should be structured as follows:

```typescript
logger().info({
    key: value,
}, "static message");

logger().error({
    // err is a special reserved key for errors
    err: error,
}, "static message");

```

## Useful Commands

```bash
# run type checking
yarn workspace backend-lib check

# Run deliveries tests
yarn jest packages/backend-lib/src/deliveries.test.ts

# Run messaging tests
yarn jest packages/backend-lib/src/messaging.test.ts
```