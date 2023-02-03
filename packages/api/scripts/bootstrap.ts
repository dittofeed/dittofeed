import bootstrap from "backend-lib/src/bootstrap";

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
