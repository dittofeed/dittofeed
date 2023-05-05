import bootstrap from "../src/bootstrap";
import config from "../src/config";

export default async function globalSetup() {
  await bootstrap({
    workspaceId: config().defaultWorkspaceId,
  });
}
