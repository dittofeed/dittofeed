import { cli } from "../src/cli";

cli().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
