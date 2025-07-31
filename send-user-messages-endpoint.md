## Background

- Dittofeed is an open-source customer engagement platform.
- We're adding transactional messaging to the platform.
- We already support using "Broadcasts" (sending messages in bulk to a group of users through the UI), and "Journeys" (sending messages through a sequence of steps, automatically).
- Now we want to add an API endpoint for programmatically sending a batch of messages immediately.

## Steps

- Implement batchMessageUsers in packages/backend-lib/src/messaging.ts
- Add a new test to packages/backend-lib/src/messaging.test.ts
- Use this method to add a new endpoint in packages/api/src/controllers/contentController.ts `POST /templates/batch-send`.

## Useful Commands

- Run type checking on the api and backend-lib packages: `yarn workspace api check`
- Run the messaging test: `LOG_LEVEL=debug yarn jest packages/backend-lib/src/messaging.test.ts`
