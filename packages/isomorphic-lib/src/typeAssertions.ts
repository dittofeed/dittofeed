export function assertUnreachable(x: never): never {
  throw new Error(`Unhandled node type ${x}`);
}
