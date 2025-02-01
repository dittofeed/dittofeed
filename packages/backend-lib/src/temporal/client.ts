import { Client } from "@temporalio/client";

import config from "../config";
import connect from "./connection";

let CLIENT: Client | null = null;

export default async function connectClient(): Promise<Client> {
  if (!CLIENT) {
    const connection = await connect();
    const client = new Client({
      connection,
      namespace: config().temporalNamespace,
    });
    CLIENT = client;
  }
  return CLIENT;
}
