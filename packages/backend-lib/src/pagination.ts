export function serializeCursor(cursor: unknown): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64");
}

export function deserializeCursor(cursor: string): unknown {
  const asciiString = Buffer.from(cursor, "base64").toString("ascii");
  return JSON.parse(asciiString);
}
