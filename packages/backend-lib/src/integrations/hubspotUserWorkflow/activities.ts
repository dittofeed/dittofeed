import axios from "axios";

import { findAllUserPropertyAssignments } from "../../userProperties";

export async function updateHubspotEmails({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) {
  const upa = findAllUserPropertyAssignments({
    workspaceId,
    userId,
  });
}
