// Tracing must be imported and registed prior to importing and starting the server.
import bootstrap from "backend-lib/src/bootstrap";

import buildApp from "../src/buildApp";
import { host, port } from "../src/config";

async function start() {
  await bootstrap();
  const app = await buildApp();
  await app.listen({ port: port(), host: host() });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
