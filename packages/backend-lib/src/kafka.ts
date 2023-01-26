import { Kafka, Partitioners } from "kafkajs";

import config from "./config";

export const kafka = new Kafka({
  clientId: "dittofeed",
  brokers: config().kafkaBrokers,
});

export const kafkaAdmin = kafka.admin();

export const kafkaProducer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
});
