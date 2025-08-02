The goal here is to improve the error handling for our Mailchimp destination in packages/backend-lib/src/destinations/mailchimp.ts.

The goal here is to distinguish between retryable errors and non-retryable errors. Non-retryable errors should be returned as error values, and retryable errors should be thrown.

Examples of retryable errors:

- Network errors
- Rate limiting errors

Examples of non-retryable errors:

- Invalid API key
- Invalid request
- Authorization errors

etc.

See packages/backend-lib/src/destinations/amazonses.ts as an example of how to handle errors.

Write unit tests in yarn jest packages/backend-lib/src/destinations/mailchimp.ts which mock the Mailchimp API and test the error handling.

Useful commands:

- run type checking: yarn workspace backend-lib check
- run tests: yarn jest packages/backend-lib/src/destinations/mailchimp.ts 

