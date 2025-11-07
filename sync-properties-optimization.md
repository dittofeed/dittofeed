# Sync Properties Optimization

The goal is to fix an issue with runaway temporal timer tasks in packages/backend-lib/src/journeys/userWorkflow.ts.

This is the code that is causing the issue:

```typescript
        if (currentNode.syncProperties) {
          const now = Date.now();

          // retry until compute properties workflow as run after message was sent
          const succeeded = await retryExponential({
            sleep,
            check: async () => {
              const period = await getEarliestComputePropertyPeriod({
                workspaceId,
              });
              logger.debug("retrying until compute properties are updated", {
                period,
                now,
                workspaceId,
                userId,
              });
              return period > now;
            },
            logger,
            baseDelay: 10000,
            maxAttempts: 5,
          });

          if (!succeeded) {
            logger.error(
              "compute properties did not sync within timeout",
              defaultLoggingFields,
            );
            nextNode = definition.exitNode;
            break;
          }
        }
```

## Create a New Activity

Create a new activity called `waitForComputeProperties` that will wait for the compute properties to be updated. Rather than polling inside of the workflow, we'll do polling within the activity, and use a heartbeat to ensure that the activity is still running.

Use `yarn workspace backend-lib check` to check for type errors.

Use the patch api for backwards compatibility.