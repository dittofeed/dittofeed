export function assertUnreachableSafe(x: never, message?: string): string {
  const messageWithDefault =
    message ?? `Unreachable code reached with value ${String(x)}`;
  return messageWithDefault;
}
