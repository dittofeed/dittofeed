import { randomUUID } from "crypto";
import { Admin, Consumer, EachMessagePayload, Producer } from "kafkajs";

import { kafka, kafkaAdmin, kafkaProducerConfig } from "../src/kafka";
import { JSONValue, KafkaMessageTypes } from "../src/types";

/**
 * Test helper for running tests against kafka. Maintain isolation
 * between tests by adding uuid's to topic names and consumer group ids.
 */
export default class KafkaSkaffold {
  // record of topic names by their prefix identifiers
  topicNames: Record<string, string[]>;

  // consumer groups
  consumers: Consumer[];

  // kafka admin client
  admin: Admin;

  // kafka producer
  producer: Producer;

  constructor() {
    this.topicNames = {};
    this.consumers = [];
    this.admin = kafkaAdmin();
    this.producer = kafka().producer(kafkaProducerConfig);
  }

  /**
   * Run in beforeAll before tests
   */
  async setupBeforeAll() {
    await Promise.all([this.admin.connect(), this.producer.connect()]);
  }

  /**
   * Run in afterAll after tests
   */
  async teardownAfterAll() {
    await Promise.all([
      this.producer.disconnect(),
      ...this.consumers.map((c) => c.disconnect()),
    ]);
    await this.admin.deleteTopics({
      topics: Object.values(this.topicNames).flat(),
    });
    await this.admin.disconnect();
  }

  /**
   * Send json payload on topic
   * @param topicPrefix
   * @param messages
   */
  async sendJson(
    topicPrefix: string,
    messages: { key: string; value: JSONValue }[],
  ) {
    const topic = this.getTopicName(topicPrefix);

    await this.producer.send({
      topic,
      messages: messages.map((m) => ({
        key: m.key,
        headers: {
          type: KafkaMessageTypes.JSON,
        },
        value: JSON.stringify(m.value),
      })),
    });
  }

  /**
   * Runs a kafka consumer, and consumes messages, passing them to findMessage
   * until findMessage returns a non-null result.
   * @param topicNamePrefix
   * @param findMessage
   * @returns
   */
  async waitForMessage<T>(
    topicNamePrefix: string,
    findMessage: (payload: EachMessagePayload) => T | null,
  ): Promise<T> {
    const topicName = this.getTopicName(topicNamePrefix);
    const message = await this.waitForMessageSuffixed(topicName, findMessage);
    return message;
  }

  async waitForMessageSuffixed<T>(
    topicName: string,
    findMessage: (payload: EachMessagePayload) => T | null,
  ): Promise<T> {
    const consumerGroup = randomUUID();
    const consumer = kafka().consumer({
      groupId: consumerGroup,
    });
    this.consumers.push(consumer);

    await consumer.connect();
    await consumer.subscribe({
      topic: topicName,
      fromBeginning: true,
    });

    const message: T = await new Promise((resolve) => {
      consumer.run({
        eachMessage: async (payload) => {
          const foundMessage = findMessage(payload);
          if (foundMessage) {
            payload.pause();
            resolve(foundMessage);
          }
        },
      });
    });
    return message;
  }

  /**
   * Creates topics with topic names suffixed with a random uuid, to ensure
   * topic contents aren't conflicting across tests.
   * @param topicNamePrefixes prefix for the topic names to create
   */
  async createTopics(topicNamePrefixes: string[]) {
    await this.admin.createTopics({
      waitForLeaders: true,
      topics: topicNamePrefixes.map((prefix) => {
        const topic = `${prefix}-${randomUUID()}`;

        const topicNames = this.topicNames[prefix];
        if (topicNames) {
          topicNames.push(topic);
        } else {
          this.topicNames[prefix] = [topic];
        }

        return {
          topic,
          numPartitions: 1,
          replicationFactor: 1,
        };
      }),
    });
  }

  /**
   * Get the randomized name of a topic given its deterministic prefix
   * @param topicNamePrefix
   * @returns
   */
  getTopicName(topicNamePrefix: string): string {
    const topics = this.topicNames[topicNamePrefix];
    const topicName = topics ? topics[topics.length - 1] : null;
    if (!topicName) {
      throw new Error(`Missing topic name for prefix ${topicName}`);
    }
    return topicName;
  }
}
