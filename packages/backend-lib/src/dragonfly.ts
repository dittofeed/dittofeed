import Redis from "ioredis";

export type DragonflyValue = string | number | null | DragonflyValue[];

export interface DragonflyClient {
  command(args: string[]): Promise<DragonflyValue>;
  close(): void;
}

function isDragonflyValue(value: unknown): value is DragonflyValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    (Array.isArray(value) && value.every((item) => isDragonflyValue(item)))
  );
}

function normalizeDragonflyValue(value: unknown): DragonflyValue {
  if (isDragonflyValue(value)) {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeDragonflyValue(item));
  }
  if (value === undefined) {
    return null;
  }
  return String(value);
}

class IoredisDragonflyClient implements DragonflyClient {
  private readonly client: Redis;

  private connecting: Promise<void> | null = null;

  constructor(url: string) {
    this.client = new Redis(url, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  async command(args: string[]): Promise<DragonflyValue> {
    await this.connect();
    const [command, ...commandArgs] = args;
    if (!command) {
      throw new Error("Dragonfly command is empty.");
    }
    const result = await this.client.call(command, ...commandArgs);
    return normalizeDragonflyValue(result);
  }

  close(): void {
    this.client.disconnect();
  }

  private async connect(): Promise<void> {
    if (this.client.status === "ready") {
      return;
    }
    if (!this.connecting) {
      this.connecting = this.client.connect().finally(() => {
        this.connecting = null;
      });
    }
    await this.connecting;
  }
}

const DRAGONFLY_CLIENTS = new Map<string, DragonflyClient>();

export function getDragonflyClient(url: string): DragonflyClient {
  const existing = DRAGONFLY_CLIENTS.get(url);
  if (existing) {
    return existing;
  }
  const client = new IoredisDragonflyClient(url);
  DRAGONFLY_CLIENTS.set(url, client);
  return client;
}

export function closeDragonflyClients(): void {
  for (const client of DRAGONFLY_CLIENTS.values()) {
    client.close();
  }
  DRAGONFLY_CLIENTS.clear();
}
