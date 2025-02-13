import { endPool } from "../src/db";

afterAll(async () => {
  console.log("tearing down after all");
  await endPool();
  console.log("setupFiles afterAll PID:", process.pid);
  console.log("teardown complete after all");
});
