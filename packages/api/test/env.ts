/**
 * Auth environment for the api test suite.
 *
 * The api controllers are exercised over real HTTP as a signed in workspace
 * member, which only resolves a member context when the app runs in
 * multi-tenant mode. The default auth mode is `anonymous`, so without these
 * values every member scoped check (such as the PII `unmaskPii` permission)
 * falls back to a forbidden response.
 *
 * Set here rather than in the CI workflow so the suite behaves the same when a
 * developer runs `yarn jest --selectProjects api` locally.
 */
process.env.AUTH_MODE = "multi-tenant";
process.env.AUTH_PROVIDER = "test";
