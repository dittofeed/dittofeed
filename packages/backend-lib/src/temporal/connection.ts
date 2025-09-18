import { Connection } from "@temporalio/client";

import config from "../config";

let CONNECTION: Connection | null = null;

export default async function connect(): Promise<Connection> {
  if (!CONNECTION) {
    const { temporalAddress, temporalConnectionTimeout } = config();
    const connection = await Connection.connect({
      address: temporalAddress,
      ...(temporalConnectionTimeout !== undefined
        ? { connectTimeout: temporalConnectionTimeout }
        : {}),
    });
    CONNECTION = connection;
  }
  return CONNECTION;
}
