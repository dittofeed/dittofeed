import { NativeConnection } from "@temporalio/worker";

import config from "../config";

export default async function createConnection() {
  const connection = await NativeConnection.connect({
    address: config().temporalAddress,
  });
  return connection;
}
