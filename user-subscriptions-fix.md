# User Subscriptions Fix

## Problem

The `getUserSubscriptions` method in `packages/backend-lib/src/subscriptionGroups.ts` is not using the correct subscription group logic. We have a distinction between opt-out and opt-in subscription groups. Opt-out subscription groups are those where the user has explicitly opted out of receiving messages. However, the current implementation of the function treats all subscription groups as opt-in, only returning `isSubscribed` as `true` if the user has explicitly opted in.

## Solution - Steps

1. Implement a new test in `packages/backend-lib/src/subscriptionGroups.test.ts`. It should fail initially. You can run it with `yarn jest packages/backend-lib/src/subscriptionGroups.test.ts`.
2. Correct the implementation of the `getUserSubscriptions` method to use the correct subscription group logic.
    - You can use the logic in `packages/backend-lib/src/users.ts` `getUsers` function as a reference.
3. Run the tests again to ensure they pass.
4. Run `yarn workspace backend-lib check` to ensure there are no type errors.