# Blob Store File Management Plan

This document outlines the plan to refactor CSV downloads and uploads to handle large files efficiently by leveraging a blob store (S3) and asynchronous background processing orchestrated by Temporal.

## 1. High-Level Strategy

The core strategy is to use S3 as a temporary staging area for all large file operations. This avoids buffering large files in the application's memory, making the system more scalable and resilient.

-   **Downloads**: The server will generate CSV files as a background job, streaming them directly to an S3 bucket. It will then provide the client with a secure, short-lived link to download the file from S3.
-   **Uploads**: The client will receive a secure, short-lived link to upload files directly to S3. The server will then be notified to process the file from the bucket, again as a background job.

## 2. Core Components

### 2.1. `downloads` Database Table

A new table will be the source of truth for all download operations.

**Schema:**

-   `id` (UUID, Primary Key): The unique identifier for the download, used as `downloadId`.
-   `workspaceId` (UUID, FK): The workspace the download belongs to.
-   `workspaceMemberId` (UUID, FK): The user who initiated the download.
-   `name` (String): A user-friendly, generated name for the download (e.g., "Segment Assignments - 2023-10-27").
-   `status` (Enum): The current state of the download.
    -   `PENDING`
    -   `PROCESSING`
    -   `COMPLETE`
    -   `FAILED`
-   `blobStorageKey` (String): The path/key of the file within the S3 bucket (e.g., `downloads/segments/uuid.csv`).
-   `downloadUrl` (String, Nullable): The final, pre-signed URL for the completed file. Stored to allow for re-downloads within its TTL.
-   `error` (String, Nullable): Stores error information if the generation process fails.
-   `createdAt` (Timestamp)
-   `updatedAt` (Timestamp)

### 2.2. Temporal Workflow: `csvDownloader`

A generic Temporal workflow will manage the lifecycle of a single download request.

-   **Deterministic Workflow ID**: The `workflowId` will be deterministically generated from the database record's `id` (e.g., `"csv-download-[downloadId]"`). This creates a durable and predictable link between the database and Temporal without needing to store the `workflowId` in the table.
-   **Parameters**: The workflow will accept parameters like `downloadId`, `workspaceId`, and `downloadType` (e.g., "segments", "users").
-   **Orchestration**: It will update the `downloads` table status (`PROCESSING`, `COMPLETE`, `FAILED`) and will call the appropriate Activity to perform the work.

### 2.3. Temporal Activities

Specialized Activities will contain the core business logic for generating different types of CSVs.

-   **Example Activities**: `segmentsDownloadActivity`, `usersDownloadActivity`.
-   **Responsibility**: Each activity is responsible for:
    1.  Paginating through the relevant database (Postgres/ClickHouse) to fetch data in chunks.
    2.  Formatting the data into a CSV stream.
    3.  Streaming the final CSV directly to the S3 object specified by the `blobStorageKey`.

## 3. API Endpoints

-   `POST /api/downloads`
    -   **Action**: Initiates a new download.
    -   **Process**:
        1.  Creates a new record in the `downloads` table with `status: 'PENDING'`.
        2.  Starts the `csvDownloader` Temporal workflow with the new `downloadId`.
        3.  Responds immediately to the client with the `downloadId`.
-   `GET /api/downloads`
    -   **Action**: Lists all historical and in-progress downloads for the requesting user/workspace.
    -   **Purpose**: Powers the "Downloads Panel" UI, allowing users to see history and re-download files.
-   `GET /api/downloads/:downloadId`
    -   **Action**: The polling endpoint for a specific download.
    -   **Process**:
        1.  Queries the `downloads` table for the record with the matching `id`.
        2.  Returns the record's `status`, `name`, `error`, and, if complete, the `downloadUrl`.

- We will need to create a new downloads controller in the api to handle the new endpoints.

## 4. Client-Side Experience

1.  A user clicks a "Download" button.
2.  The client calls `POST /api/downloads` and stores the returned `downloadId` in its state.
3.  The UI updates to show a "Preparing your download..." message or a notification toast.
4.  The client begins polling the `GET /api/downloads/:downloadId` endpoint every few seconds.
5.  When the poll response shows `status: 'COMPLETE'`, the client stops polling.
6.  The download begins **automatically** by programmatically navigating the browser to the `downloadUrl` from the poll response (e.g., `window.location.href = url`).
7.  A "Downloads Panel" or dropdown can be implemented to display recent downloads by calling `GET /api/downloads`.

## 5. S3 and Operations

-   **S3 Lifecycle Policy**: An S3 Lifecycle Policy will be configured on the bucket to automatically delete objects under the `downloads/` prefix after a defined Time-To-Live (TTL), for example, 7 days. This manages storage costs and enforces data retention policies.
-   **Pre-signed URL TTL**: The generated `downloadUrl` will have a short, secure TTL (e.g., 1-24 hours) to prevent unauthorized long-term access.

## Implementation Notes

### Relevant Files

- packages/backend-lib/src/blobStorage.ts
    - Location of existing and future blob storage code.
- packages/backend-lib/src/db/schema.ts
    - Where new postgres table(s) will be added.
- packages/backend-lib/src/db/relations.ts
    - Where new postgres relations will be added.
- packages/backend-lib/src/config.ts
    - Location of existing and future environment variable derived configuration values.
- packages/api/src/controllers/segmentsController.ts, packages/backend-lib/src/segments.ts
    - Where code related to segment downloads is located.
- packages/api/src/controllers/eventsController.ts, packages/backend-lib/src/userEvents.ts
    - Where code related to event downloads is located.
- packages/api/src/controllers/usersController.ts, packages/backend-lib/src/users.ts
    - Where code related to user downloads is located.
- packages/backend-lib/src/logger.ts
    - Our application's logger.
- packages/backend-lib/src/temporal/activities.ts, packages/backend-lib/src/temporal/workflows.ts
    - Where code related to Temporal workflows and activities are exported to be registered with the worker.

### Guidelines

- Don't use any unsafe typescript e.g. `any`, type assertions, non-null assertions, etc.
- If you get stuck, iterating on the same problem for a substantial amount of time, ask for help.
- Always ask for permission before installing new dependencies.
- Use our logger as follows:
    - Standard code `
        - `logger().info({ ... }, "static message")`
        - `logger().debug({ ... }, "static message")`
        - `logger().warn({ ... }, "static message")`
        - `logger().error({ err: myErrorObject }, "static message")`
    - Workflow logging:
        - `logger.info("static message", { ... })`
        - `logger.debug("static message", { ... })`
        - `logger.warn("static message", { ... })`
        - `logger.error("static message", { err: myErrorObject })`
- Write a test for the new workflow.

## Useful Commands

- Run type checking for both the `api` and `backend-lib` packages: `yarn workspace api check`
- Run a particular test: `LOG_LEVEL=debug yarn jest packages/backend-lib/src/myTest.test.ts`
- Create migrations: `yarn workspace backend-lib drizzle-kit generate`
- Run migrations: `yarn workspace backend-lib drizzle-kit migrate`
