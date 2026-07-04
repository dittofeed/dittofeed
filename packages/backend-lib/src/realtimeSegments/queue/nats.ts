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
import {
  ClaimedRealtimeSegmentEvalJob,
  RealtimeSegmentEvalJob,
  RealtimeSegmentQueue,
} from "../types";

interface EncodedRealtimeSegmentEvalJob
  extends Omit<RealtimeSegmentEvalJob, "eventTime" | "processingTime"> {
  eventTime: string;
  processingTime: string;
}

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
  return {
    ...job,
    id,
    attempts,
    eventTime: new Date(job.eventTime),
    processingTime: new Date(job.processingTime),
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

    let consumerExists = false;
    try {
      await manager.consumers.info(
        backendConfig.realtimeSegmentsNatsStream,
        backendConfig.realtimeSegmentsNatsConsumer,
      );
      consumerExists = true;
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
        max_ack_pending: backendConfig.realtimeSegmentsNatsMaxAckPending,
        max_deliver: backendConfig.realtimeSegmentsMaxRetries,
      });
    }
    if (consumerExists) {
      await manager.consumers.update(
        backendConfig.realtimeSegmentsNatsStream,
        backendConfig.realtimeSegmentsNatsConsumer,
        {
          ack_wait: nanos(backendConfig.realtimeSegmentsNatsAckWaitMs),
          max_ack_pending: backendConfig.realtimeSegmentsNatsMaxAckPending,
          max_deliver: backendConfig.realtimeSegmentsMaxRetries,
        },
      );
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

  async markComplete({ id }: { id: string; lockId: string }): Promise<void> {
    const message = this.inflight.get(id);
    if (!message) {
      logger().warn({ id }, "NATS realtime segment job was not inflight.");
      return;
    }

    await message.ackAck();
    this.inflight.delete(id);
  }

  async markFailed({
    id,
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
      return;
    }

    if (message.info.deliveryCount >= maxRetries) {
      await message.ackAck();
      this.inflight.delete(id);
      return;
    }

    message.nak(1_000);
    this.inflight.delete(id);
  }
}
