import { Kafka, Partitioners } from "kafkajs";

import config from "./config";

const { kafkaUsername, kafkaPassword, kafkaBrokers } = config();

export const kafka = new Kafka({
  clientId: "dittofeed",
  brokers: kafkaBrokers,
  sasl: {
    mechanism: "plain",
    username: kafkaUsername,
    password: kafkaPassword,
  },
});

export const kafkaAdmin = kafka.admin();

export const kafkaProducer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
});
