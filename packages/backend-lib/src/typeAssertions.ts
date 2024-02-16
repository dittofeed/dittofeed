import logger from "./logger";

export function assertUnreachableSafe(x: never, message?: string): never {
  const messageWithDefault =
    message ?? `Unreachable code reached with value ${x}`;
  logger().error({
    value: x
  }, messageWithDefault);
}