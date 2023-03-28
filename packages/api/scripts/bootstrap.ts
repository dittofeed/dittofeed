import bootstrap from "backend-lib/src/bootstrap";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";

function boostrapStart() {
  if (backendConfig().logConfig) {
    logger().info(backendConfig(), "Initialized with config");
  }
  return bootstrap();
}
boostrapStart().catch((e) => {
  console.error(e);
  process.exit(1);
});
