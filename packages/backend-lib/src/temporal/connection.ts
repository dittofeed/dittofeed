import { Connection } from "@temporalio/client";

import config from "../config";

let CONNECTION: Connection | null = null;

export default async function connect(): Promise<Connection> {
  if (!CONNECTION) {
    const connection = await Connection.connect({
      address: config().temporalAddress,
    });
    CONNECTION = connection;
  }
  return CONNECTION;
}
