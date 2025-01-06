import { bootstrapClickhouse } from "../src/bootstrap";
import { drizzleMigrate } from "../src/prisma/migrate";

export default async function globalSetup() {
  await Promise.all([bootstrapClickhouse(), drizzleMigrate()]);
}
