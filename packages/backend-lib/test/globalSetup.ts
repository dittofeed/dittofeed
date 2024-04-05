import { bootstrapClickhouse } from "../src/bootstrap";
import { prismaMigrate } from "../src/prisma/migrate";

export default async function globalSetup() {
  await Promise.all([bootstrapClickhouse(), prismaMigrate()]);
}
