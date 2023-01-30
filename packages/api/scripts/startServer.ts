// Tracing must be imported and registed prior to importing and starting the server.
import bootstrap from "backend-lib/src/bootstrap";

import buildApp from "../src/buildApp";
import config from "../src/config";

async function start() {
  await bootstrap();
  const app = await buildApp();
  const { port, host } = config();
  await app.listen({ port, host });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
