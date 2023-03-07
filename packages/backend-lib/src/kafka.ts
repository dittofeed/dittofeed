import {
  Kafka,
  Partitioners,
  Producer,
  ProducerConfig,
  SASLOptions,
} from "kafkajs";

import config from "./config";

const {
  kafkaUsername,
  kafkaPassword,
  kafkaBrokers,
  kafkaSsl,
  kafkaSaslMechanism,
} = config();

const sasl: SASLOptions | undefined =
  kafkaUsername && kafkaPassword
    ? {
        mechanism: kafkaSaslMechanism,
        username: kafkaUsername,
        password: kafkaPassword,
      }
    : undefined;

export const kafka = new Kafka({
  clientId: "dittofeed",
  brokers: kafkaBrokers,
  ssl: kafkaSsl,
  sasl,
});

export const kafkaAdmin = kafka.admin();

export const kafkaProducerConfig: ProducerConfig = {
  createPartitioner: Partitioners.DefaultPartitioner,
};

let KAFKA_PRODUCER: null | Producer = null;

export async function kafkaProducer() {
  if (!KAFKA_PRODUCER) {
    KAFKA_PRODUCER = kafka.producer(kafkaProducerConfig);
    await KAFKA_PRODUCER.connect();
  }
  return KAFKA_PRODUCER;
}
