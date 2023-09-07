import { randomUUID } from "crypto";

import bootstrap from "../src/bootstrap";

export default async function globalSetup() {
  await bootstrap({
    workspaceId: randomUUID(),
    workspaceName: "test-workspace",
  });
}
