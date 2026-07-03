/* eslint-disable class-methods-use-this */

import {
  AckPolicy,
  connect,
  DeliverPolicy,
  DiscardPolicy,
  JetStreamClient,
  JsMsg,
  JSONCodec,
  nanos,
  NatsConnection,
  NatsError,
  RetentionPolicy,
  StorageType,
} from "nats";

import config from "../../config";
import logger from "../../logger";
import { JSONValue } from "../../types";
import {
  ClaimedRealtimeSegmentEvalJob,
  RealtimeSegmentEvalJob,
  RealtimeSegmentQueue,
} from "../types";

type EncodedRealtimeSegmentEvalJob = {
  workspaceId: string;
  userOrAnonymousId: string;
  anonymousId?: string;
  userId?: string;
  payload: Record<string, JSONValue>;
  eventTime: string;
  processingTime: string;
  messageId: string;
} & (
  | {
      type?: "eventReceived";
      eventType: string;
      event?: string;
      traitPaths: string[];
      propertyPaths: string[];
    }
  | { type: "segmentChange"; segment: string }
);

function encodeJob(job: RealtimeSegmentEvalJob): EncodedRealtimeSegmentEvalJob {
  return {
    ...job,
    eventTime: job.eventTime.toISOString(),
    processingTime: job.processingTime.toISOString(),
  };
}

function decodeJob({
  id,
  attempts,
  job,
}: {
  id: string;
  attempts: number;
  job: EncodedRealtimeSegmentEvalJob;
}): ClaimedRealtimeSegmentEvalJob {
  if ("type" in job && job.type === "segmentChange") {
    return {
      ...job,
      id,
      attempts,
      eventTime: new Date(job.eventTime),
      processingTime: new Date(job.processingTime),
      type: "segmentChange",
    };
  }

  return {
    ...job,
    id,
    attempts,
    eventTime: new Date(job.eventTime),
    processingTime: new Date(job.processingTime),
    type: "eventReceived",
  };
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof NatsError && error.api_error?.code === 404;
}

export class NatsRealtimeSegmentQueue implements RealtimeSegmentQueue {
  private connection: NatsConnection | null = null;

  private jetstream: JetStreamClient | null = null;

  private readonly codec = JSONCodec<EncodedRealtimeSegmentEvalJob>();

  private readonly inflight = new Map<string, JsMsg>();

  private initialized = false;

  private async getConnection(): Promise<NatsConnection> {
    if (this.connection) {
      return this.connection;
    }

    const backendConfig = config();
    this.connection = await connect({
      servers: backendConfig.realtimeSegmentsNatsServers,
      user: backendConfig.realtimeSegmentsNatsUsername,
      pass: backendConfig.realtimeSegmentsNatsPassword,
      token: backendConfig.realtimeSegmentsNatsToken,
      name: "dittofeed-realtime-segments",
    });
    this.jetstream = this.connection.jetstream();

    return this.connection;
  }

  private async getJetstream(): Promise<JetStreamClient> {
    if (this.jetstream) {
      return this.jetstream;
    }

    const connection = await this.getConnection();
    this.jetstream = connection.jetstream();

    return this.jetstream;
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const backendConfig = config();
    const connection = await this.getConnection();
    const manager = await connection.jetstreamManager();

    try {
      await manager.streams.info(backendConfig.realtimeSegmentsNatsStream);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }

      await manager.streams.add({
        name: backendConfig.realtimeSegmentsNatsStream,
        subjects: [backendConfig.realtimeSegmentsNatsSubject],
        retention: RetentionPolicy.Workqueue,
        storage: StorageType.File,
        discard: DiscardPolicy.New,
        max_msgs: -1,
        max_bytes: -1,
        max_age: 0,
      });
    }

    try {
      await manager.consumers.info(
        backendConfig.realtimeSegmentsNatsStream,
        backendConfig.realtimeSegmentsNatsConsumer,
      );
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }

      await manager.consumers.add(backendConfig.realtimeSegmentsNatsStream, {
        durable_name: backendConfig.realtimeSegmentsNatsConsumer,
        name: backendConfig.realtimeSegmentsNatsConsumer,
        filter_subject: backendConfig.realtimeSegmentsNatsSubject,
        deliver_policy: DeliverPolicy.All,
        ack_policy: AckPolicy.Explicit,
        ack_wait: nanos(backendConfig.realtimeSegmentsNatsAckWaitMs),
        max_ack_pending: backendConfig.realtimeSegmentsQueueBatchSize,
        max_deliver: backendConfig.realtimeSegmentsMaxRetries,
      });
    }

    this.initialized = true;
  }

  async enqueue(jobs: RealtimeSegmentEvalJob[]): Promise<void> {
    if (jobs.length === 0) {
      return;
    }

    await this.initialize();
    const backendConfig = config();
    const jetstream = await this.getJetstream();

    await Promise.all(
      jobs.map((job) =>
        jetstream.publish(
          backendConfig.realtimeSegmentsNatsSubject,
          this.codec.encode(encodeJob(job)),
          {
            msgID: `${job.workspaceId}:${job.messageId}`,
          },
        ),
      ),
    );
  }

  async claim({
    batchSize,
  }: {
    batchSize: number;
    lockId: string;
    maxRetries: number;
  }): Promise<ClaimedRealtimeSegmentEvalJob[]> {
    await this.initialize();

    const backendConfig = config();
    const jetstream = await this.getJetstream();
    const consumer = await jetstream.consumers.get(
      backendConfig.realtimeSegmentsNatsStream,
      backendConfig.realtimeSegmentsNatsConsumer,
    );
    const messages = await consumer.fetch({
      max_messages: batchSize,
      expires: 1_000,
    });
    const jobs: ClaimedRealtimeSegmentEvalJob[] = [];

    for await (const message of messages) {
      const id = message.info.streamSequence.toString();
      this.inflight.set(id, message);
      jobs.push(
        decodeJob({
          id,
          attempts: message.info.deliveryCount,
          job: this.codec.decode(message.data),
        }),
      );
    }

    await messages.close();
    return jobs;
  }

  markComplete({ id }: { id: string; lockId: string }): Promise<void> {
    const message = this.inflight.get(id);
    if (!message) {
      logger().warn({ id }, "NATS realtime segment job was not inflight.");
      return Promise.resolve();
    }

    message.ack();
    this.inflight.delete(id);
    return Promise.resolve();
  }

  markFailed({
    id,
    error,
    maxRetries,
  }: {
    id: string;
    lockId: string;
    error: Error;
    maxRetries: number;
  }): Promise<void> {
    const message = this.inflight.get(id);
    if (!message) {
      logger().warn({ id }, "NATS realtime segment job was not inflight.");
      return Promise.resolve();
    }

    if (message.info.deliveryCount >= maxRetries) {
      message.term(error.message);
    } else {
      message.nak(1_000);
    }
    this.inflight.delete(id);
    return Promise.resolve();
  }
}
