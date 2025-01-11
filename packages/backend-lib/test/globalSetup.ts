import { bootstrapClickhouse } from "../src/bootstrap";
import { drizzleMigrate } from "../src/migrate";

export default async function globalSetup() {
  await Promise.all([bootstrapClickhouse(), drizzleMigrate()]);
}
