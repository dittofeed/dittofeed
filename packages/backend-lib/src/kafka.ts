import { Kafka, Partitioners } from "kafkajs";

import config from "./config";

const { kafkaUsername, kafkaPassword, kafkaBrokers, kafkaSsl } = config();

const sasl: ConstructorParameters<typeof Kafka>[0]["sasl"] | undefined =
  kafkaUsername && kafkaPassword
    ? {
        mechanism: "plain",
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

export const kafkaProducer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
});
