import buildApp from "../src/buildApp";
import config from "../src/config";

async function start() {
  const app = await buildApp();
  const { port, host } = config();
  await app.listen({ port, host });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
