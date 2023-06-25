import { cli } from "../src/cli";

cli().catch((err) => {
  console.error(err);
  process.exit(1);
});
