import { v5 as uuidv5 } from "uuid";

export function getBroadcastSegmentName({
  broadcastId,
}: {
  broadcastId: string;
}): string {
  return `Broadcast - ${broadcastId}`;
}

export function getBroadcastTemplateName({
  broadcastId,
}: {
  broadcastId: string;
}): string {
  return `Broadcast - ${broadcastId}`;
}

export function getBroadcastJourneyName({
  broadcastId,
}: {
  broadcastId: string;
}): string {
  return `Broadcast - ${broadcastId}`;
}

export function getBroadcastSegmentId({
  workspaceId,
  broadcastId,
}: {
  workspaceId: string;
  broadcastId: string;
}): string {
  return uuidv5(`${broadcastId}-segment`, workspaceId);
}

export function getBroadcastMessageTemplateId({
  workspaceId,
  broadcastId,
}: {
  workspaceId: string;
  broadcastId: string;
}): string {
  return uuidv5(`${broadcastId}-message-template`, workspaceId);
}

export function getBroadcastMessageTemplateName({
  broadcastId,
}: {
  broadcastId: string;
}): string {
  return `Broadcast - ${broadcastId}`;
}
