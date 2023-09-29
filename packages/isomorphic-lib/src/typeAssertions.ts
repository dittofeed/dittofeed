export function assertUnreachable(x: never, message?: string): never {
  const messageWithDefault =
    message ?? `Unreachable code reached with value ${x}`;
  throw new Error(messageWithDefault);
}
