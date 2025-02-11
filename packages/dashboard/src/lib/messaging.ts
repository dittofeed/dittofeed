import { and } from "drizzle-orm";
import { db } from "backend-lib/src/db";
import { AppState } from "./types";

async function serveSmsTemplate({
  workspaceId,
  messageTemplateId,
}: {
  workspaceId: string;
  messageTemplateId: string;
}): Promise<Pick<AppState, "messages" | "userProperties">> {
  throw new Error("Not implemented");
}
