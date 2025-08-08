# Separate workers

The goal of this change is to allow Dittofeed lite to run with separate worker pools.

## Background

By default the lite version of our application bundles three services into one process.

- The Dashboard: a nextjs service.
- The API: a fastify service.
- The Worker: a temporal worker.

Bundling these services into one process is convenient for simple deployments, but provides less fine grained control over scalability. We provide a helm chart in order to make it easier to deploy Dittofeed to kubernetes. It currently only supports deploying Dittofeed in this bundled mode.

## Goal

We want the consumers of our helm chart to be able to deploy Dittofeed in a mode where the worker is separated from the non-worker services (the API and Dashboard which will remain bundled). This will involve supporting the new `separateWorker` configuration in the helm chart values file: `helm-charts/dittofeed/values.yaml`.

## Implementation

When the `separateWorker` configuration is enabled.

- Add the env variable `ENABLE_WORKER=false` to the main deployment.
- Create three new deployments, one corresponding to each of the temporal queues.
    - Each of these deployments should have all of the same environment variables as the main deployment.
    - They should use the worker image rather than the dittofeed-lite image.
    - They should each have a `TASK_QUEUE` environment variable set to the name of the queue they are handling (e.g. `default`, `workspace`, `global`).
    - They should each have a label `queue` set to the name of the queue they are handling (e.g. `default`, `workspace`, `global`).
- All four deployments should receive the following new environment variables:
    - `GLOBAL_CRON_TASK_QUEUE`: `global`
    - `COMPUTED_PROPERTIES_TASK_QUEUE`: `workspace`
    - `COMPUTED_PROPERTIES_ACTIVITY_TASK_QUEUE`: `workspace`
