# dashboard-e2e

End-to-end tests for the Dittofeed dashboard, powered by
[Playwright](https://playwright.dev/).

## Prerequisites

A **running** Dittofeed stack (dashboard + api). The tests drive the real UI and
API — they do not start or mock anything.

```bash
# from the repo root, e.g.
docker compose --profile apps up
```

## Setup

```bash
# install the Playwright dependency (from the repo root)
node .yarn/releases/yarn-4.1.1.cjs install

# download the Chromium browser used by the tests
node .yarn/releases/yarn-4.1.1.cjs workspace dashboard-e2e e2e:install
```

## Run

```bash
node .yarn/releases/yarn-4.1.1.cjs workspace dashboard-e2e e2e
```

## Configuration

Base URLs default to the local stack and can be overridden with the same env
vars the apps use:

| Variable             | Default                 | Used by                     |
| -------------------- | ----------------------- | --------------------------- |
| `DASHBOARD_URL`      | `http://localhost:3000` | UI tests (`baseURL`)        |
| `DASHBOARD_API_BASE` | `http://localhost:3001` | API tests                   |
| `DF_WORKSPACE_ID`    | –                       | `api.spec.ts` (skipped if unset) |
| `E2E_USER_ID`        | –                       | `users.spec.ts` (skipped if unset) |

The `navigation.spec.ts` suite needs no credentials and runs against any
bootstrapped workspace. The `api.spec.ts` and `users.spec.ts` suites are
data-dependent and skip themselves unless the corresponding env vars are set.
