import buildApp from "api/src/buildApp";

async function startLite() {
  const app = await buildApp();
}

startLite()
  .then(() => {
    console.log("Lite started");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
