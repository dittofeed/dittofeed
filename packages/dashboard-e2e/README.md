# dashboard-e2e

End-to-end tests for Dittofeed, powered by [Playwright](https://playwright.dev/).

The tests drive a **running** stack (dashboard + api + worker). Nothing is
mocked: `pipeline.spec.ts` sends real events through the public API and waits
for the worker to produce a real delivery.

## What is covered

| Spec                | Kind          | Proves                                                             |
| ------------------- | ------------- | ------------------------------------------------------------------ |
| `pipeline.spec.ts`  | API + UI      | an event enters a workspace, matches a journey, and produces a delivery that shows up in the dashboard |
| `navigation.spec.ts`| UI            | the dashboard boots, renders its navigation, and loads the list pages |
| `api.spec.ts`       | API           | `POST /api/users` returns a users payload                          |
| `users.spec.ts`     | UI            | a known user's detail page renders                                |

`pipeline.spec.ts` is the behavioural test; `navigation.spec.ts` is a thin
smoke test and is kept to five cases on purpose. Deeper behavioural coverage
belongs in the package test suites (`backend-lib`, `dashboard`, `api`), not in
this package.

## Prerequisites

A running stack. The simplest way is docker compose:

```bash
# from the repo root: postgres, clickhouse, temporal, api, worker, dashboard
docker compose --profile apps up
```

The worker is required by `pipeline.spec.ts` — without it events are recorded
but never fan out into journeys. The journey also sends an email using the
user's `email` property, and user properties are materialized by the computed
properties workflow. Start that workflow while bootstrapping the workspace:

```bash
docker compose exec -e BOOTSTRAP_WORKER=true admin-cli \
  yarn admin bootstrap --workspace-name Default
```

Without the workflow the event still reaches the journey, but the send is
skipped with `MissingIdentifier` because the recipient's `email` property was
never materialized, so `pipeline.spec.ts` times out with an explanatory
message.

## Setup

```bash
# install the Playwright dependency (from the repo root)
yarn install

# download the Chromium browser used by the tests
yarn workspace dashboard-e2e e2e:install
```

## Run

```bash
DF_WORKSPACE_ID=<workspace id> yarn workspace dashboard-e2e e2e
```

`DF_WORKSPACE_ID` is required by `api.spec.ts` and `pipeline.spec.ts`; both are
skipped without it. Every workspace id is different, so the value is always
passed in — nothing workspace specific is hardcoded in the fixtures.

## Configuration

| Variable             | Default                 | Used by                                        |
| -------------------- | ----------------------- | ---------------------------------------------- |
| `DASHBOARD_URL`      | `http://localhost:3000` | UI tests (`baseURL`)                           |
| `DASHBOARD_API_BASE` | `http://localhost:3001` | API tests                                      |
| `DF_WORKSPACE_ID`    | –                       | `api.spec.ts`, `pipeline.spec.ts` (skipped if unset) |
| `E2E_USER_ID`        | –                       | `users.spec.ts` (skipped if unset)             |

On a freshly bootstrapped stack:

```bash
docker compose exec postgres \
  psql -U postgres -d dittofeed -c 'select id, name from "Workspace";'
```

`pipeline.spec.ts` creates and then deletes its own template, subscription
group, journey, and write key, so it can be pointed at any workspace. It does
set the workspace's **default email provider** to `Test` and cannot restore the
previous one — the API never returns provider secrets — so point the suite at a
disposable workspace rather than one that sends real mail. The `Test` provider
records a successful send without touching the network, so the mail server does
not need to be running.
