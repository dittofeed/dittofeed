import { endPool } from "../src/db";

afterAll(async () => {
  await endPool();
});
