import {
  Kafka,
  Partitioners,
  Producer,
  ProducerConfig,
  SASLOptions,
} from "kafkajs";

import config from "./config";

let KAFKA: Kafka | null = null;

export function kafka(): Kafka {
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

  if (!KAFKA) {
    KAFKA = new Kafka({
      clientId: "dittofeed",
      brokers: kafkaBrokers,
      ssl: kafkaSsl,
      sasl,
    });
  }
  return KAFKA;
}

export function kafkaAdmin() {
  return kafka().admin();
}

export const kafkaProducerConfig: ProducerConfig = {
  createPartitioner: Partitioners.DefaultPartitioner,
};

let KAFKA_PRODUCER: null | Producer = null;

export async function kafkaProducer() {
  if (!KAFKA_PRODUCER) {
    const producer = kafka().producer(kafkaProducerConfig);
    await producer.connect();
    KAFKA_PRODUCER = producer;
  }
  return KAFKA_PRODUCER;
}
