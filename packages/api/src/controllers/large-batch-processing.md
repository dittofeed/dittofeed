# Improving Large Batch Event Processing for User Segmentation

## 1. Introduction

This document outlines a problem encountered with our current micro-batching architecture for calculating live user segments in ClickHouse. Specifically, it addresses performance degradation and timeouts when ingesting and processing very large batches of user events. It then details a proposed solution involving dynamic, server-side bucketing of users to make batch processing more resilient and scalable.

## 2. The Problem: System Overload During Large Batch Ingests

Our current architecture processes user events in micro-batches to update user segment assignments. This works well for a continuous, relatively even flow of events. However, we face challenges when a workspace ingests a very large batch of events (millions of events) simultaneously, such as during an initial data import or a bulk update.

The core issues are:

* **Query Timeouts:** The primary ClickHouse queries responsible for aggregating event data per user (to update `user_states_micro_batch`) and subsequently recalculating segment assignments (updating `segment_assignments_micro_batch`) become excessively slow or time out. This is because these queries attempt to process all new events for all affected users within a single processing window and `GROUP BY user_id` operation.
* **Scalability Limits:** With millions of users per workspace and thousands of workspaces, a solution that requires loading extensive lists of user identifiers into application memory for client-side pagination is not feasible.
* **Service Degradation:** These prolonged queries can strain ClickHouse resources, potentially affecting other operations or tenants. The goal is to process these large batches efficiently without compromising system stability.

## 3. The Solution: Dynamic User ID Bucketing

To address these challenges, we will implement a dynamic user ID bucketing strategy. This approach aims to break down the processing of large batches into smaller, more manageable chunks, primarily leveraging ClickHouse's capabilities with orchestration from our application. This will be done on a per-workspace basis.

Key components of the solution include:

### 3.1. Workspace-Scoped Processing

All batch processing operations, from workload estimation to data insertion, will be strictly scoped to an individual `workspace_id`. This ensures data isolation and allows for targeted processing.

### 3.2. Workload Estimation

For each workspace and each polling period where a large batch is detected (or for all periods as a standard procedure), the application will first query ClickHouse. This initial query will determine the scale of the current batch by calculating the number of distinct users who have new events within the defined processing window (`lastPollingPeriod` to `overallBatchTimestamp`).

### 3.3. Dynamic Bucket Calculation

Based on the count of distinct users from the workload estimation step, the application will dynamically calculate the number of "buckets" to use for processing. This calculation will use a configurable parameter: `TARGET_DISTINCT_USERS_PER_BUCKET`.

The formula will be approximately: `numBuckets = ceil(distinctUsersInWindow / TARGET_DISTINCT_USERS_PER_BUCKET)`.

* A minimum of one bucket will always be used.
* To prevent an excessive number of very small queries (which can also be inefficient), an additional configurable parameter, `MAX_ALLOWED_BUCKETS`, will cap the total number of buckets.

### 3.4. Iterative Bucket Processing (Application Coordinated)

The application will then loop from `bucketId = 0` to `numBuckets - 1`. In each iteration, it will instruct ClickHouse to process only the users belonging to the current bucket.

### 3.5. ClickHouse-Side Bucketing Logic

Within the ClickHouse queries that update `user_states_micro_batch` and `segment_assignments_micro_batch`, a hashing mechanism will be used to assign users to buckets. This will be achieved by adding a `WHERE` clause condition like:
`modulo(cityHash64(user_id), numBuckets) = current_bucket_id`.

This ensures that each ClickHouse query in the loop processes only a subset of the users from the large batch.

### 3.6. Consistent Timestamps for Batch Integrity

A single, consistent timestamp (`overallBatchTimestamp`) will be generated at the start of processing a workspace's batch. This timestamp will be used for the `computed_at` field in `user_states_micro_batch` and the `assigned_at` field in `segment_assignments_micro_batch` for all records updated across all buckets within that single conceptual batch run. This ensures data integrity and simplifies identifying all parts of a single batch operation.

### 3.7. Supporting Table Structures

The existing ClickHouse table structures (e.g., `user_events_event_time`, `user_states_micro_batch`, `updated_user_states_micro_batch`, `segment_assignments_micro_batch`) are generally suitable but will consistently include `workspace_id` in their definitions and `ORDER BY` keys to support efficient multi-tenant operations.

## 4. Expected Benefits

* **Increased Stability:** Prevents query timeouts and system overload when processing large batches of events by breaking work into smaller, manageable units.
* **Improved Scalability:** Allows the system to handle larger batch sizes more gracefully by dynamically adjusting processing granularity.
* **Consistent Performance:** Aims for more predictable query execution times per bucket, regardless of the total batch size.
* **Resource Management:** Reduces peak load on ClickHouse during batch processing.

## 5. Key Considerations Moving Forward

* **Parameter Tuning:** The new parameters (`TARGET_DISTINCT_USERS_PER_BUCKET`, `MAX_ALLOWED_BUCKETS`) will require careful tuning based on performance testing and observation of production workloads.
* **Monitoring:** Enhanced monitoring will be needed to observe the performance of the bucketing process, including the initial count query and individual bucket processing times.
* **Error Handling:** Robust error handling and potential retry mechanisms for individual buckets or workspace batches will be important.