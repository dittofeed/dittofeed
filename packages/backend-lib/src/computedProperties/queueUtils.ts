import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";

import { WorkspaceQueueItem, WorkspaceQueueItemType } from "../types";

/**
 * Generate a unique membership key for a queue item.
 * - Entire workspace jobs key on workspace id.
 * - Individual computed-property jobs key on (type, workspaceId, propertyId).
 */
export function generateKeyFromItem(item: WorkspaceQueueItem): string {
  switch (item.type) {
    case WorkspaceQueueItemType.Batch:
      return `${item.type}:${item.workspaceId}`;
    case WorkspaceQueueItemType.Segment:
    case WorkspaceQueueItemType.UserProperty:
    case WorkspaceQueueItemType.Integration:
    case WorkspaceQueueItemType.Journey:
      return `${item.type}:${item.workspaceId}:${item.id}`;
    case WorkspaceQueueItemType.Workspace:
    case undefined:
      return `${WorkspaceQueueItemType.Workspace}:${item.id}`;
    default:
      assertUnreachable(item);
  }
}

export function getWorkspaceIdFromItem(item: WorkspaceQueueItem): string {
  switch (item.type) {
    case WorkspaceQueueItemType.Batch:
    case WorkspaceQueueItemType.Segment:
    case WorkspaceQueueItemType.UserProperty:
    case WorkspaceQueueItemType.Integration:
    case WorkspaceQueueItemType.Journey:
      return item.workspaceId;
    case WorkspaceQueueItemType.Workspace:
    case undefined:
      return item.id;
    default:
      assertUnreachable(item);
  }
}
