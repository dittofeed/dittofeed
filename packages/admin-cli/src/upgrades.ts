import logger from "backend-lib/src/logger";

export async function upgradeV010Pre() {
  logger().info("Performing pre-upgrade steps for to v0.10.0");
}

export async function upgradeV010Post() {
  logger().info("Performing post-upgrade steps for to v0.10.0");
}
