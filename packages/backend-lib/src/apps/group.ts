import {
  BatchGroupData,
  BatchIdentifyData,
  BatchTrackData,
  EventType,
  GroupData,
  GroupUserAssignmentProperties,
  IdentifyData,
  InternalEventType,
  TrackData,
  TrackEventProperties,
  UserGroupAssignmentProperties,
} from "../types";

function isBatchGroupData(
  data: GroupData | BatchGroupData,
): data is BatchGroupData {
  return "type" in data && data.type === EventType.Group;
}

function isGroupData(data: GroupData | BatchGroupData): data is GroupData {
  return !("type" in data);
}

// Function overload signatures
export function splitGroupEvents(
  data: GroupData,
): [TrackData, TrackData] | [TrackData, TrackData, IdentifyData];
export function splitGroupEvents(
  data: BatchGroupData,
):
  | [BatchTrackData, BatchTrackData]
  | [BatchTrackData, BatchTrackData, BatchIdentifyData];

/**
 * Split group into several other events
 * Group events should emit two track events:
 * 1. A track event with a user or anonymous id set to the group id, with the
 * event name InternalEventType.GroupUserAssignment
 * 2. A track event with a user or anonymous id set to its original value, with
 * the event name InternalEventType.UserGroupAssignment
 * 3. Optionally, if traits are specified, an identify event with the user or
 * anonymous id set to the group id
 * @param _data The group event data to split
 * @returns Either an array with two track events or an array with two track events and an identify event
 */
export function splitGroupEvents(
  data: GroupData | BatchGroupData,
):
  | [TrackData | BatchTrackData, TrackData | BatchTrackData]
  | [
      TrackData | BatchTrackData,
      TrackData | BatchTrackData,
      IdentifyData | BatchIdentifyData,
    ] {
  const userOrAnonymousId = "userId" in data ? data.userId : data.anonymousId;
  const assigned = data.assigned ?? true;

  const userGroupAssignmentProperties: TrackEventProperties = {
    groupId: data.groupId,
    assigned,
  } satisfies UserGroupAssignmentProperties;

  const groupUserAssignmentProperties: TrackEventProperties = {
    userId: userOrAnonymousId,
    assigned,
  } satisfies GroupUserAssignmentProperties;

  const partialUserGroupAssignmentEvent: Omit<BatchTrackData, "type"> = {
    event: InternalEventType.GroupUserAssignment,
    messageId: data.messageId,
    properties: userGroupAssignmentProperties,
    timestamp: data.timestamp,
  };

  const partialGroupUserAssignmentEvent: Omit<BatchTrackData, "type"> = {
    event: InternalEventType.GroupUserAssignment,
    messageId: data.messageId,
    properties: groupUserAssignmentProperties,
    timestamp: data.timestamp,
  };

  const userIdOrAnonymousIdRecord =
    "userId" in data
      ? { userId: data.userId }
      : { anonymousId: data.anonymousId };

  if (isBatchGroupData(data)) {
    const groupUserAssignmentEvent: BatchTrackData = {
      ...partialGroupUserAssignmentEvent,
      ...userIdOrAnonymousIdRecord,
      type: EventType.Track,
    };
    const userGroupAssignmentEvent: BatchTrackData = {
      ...partialUserGroupAssignmentEvent,
      ...userIdOrAnonymousIdRecord,
      type: EventType.Track,
    };
    const identifyEvent: BatchIdentifyData | null =
      data.traits && Object.keys(data.traits).length > 0
        ? {
            ...userIdOrAnonymousIdRecord,
            type: EventType.Identify,
            messageId: data.messageId,
            timestamp: data.timestamp,
            traits: data.traits,
          }
        : null;
    if (identifyEvent) {
      return [
        userGroupAssignmentEvent,
        groupUserAssignmentEvent,
        identifyEvent,
      ];
    }
    return [userGroupAssignmentEvent, groupUserAssignmentEvent];
  }
  if (isGroupData(data)) {
    const userGroupAssignmentEvent: TrackData = {
      ...partialUserGroupAssignmentEvent,
      ...userIdOrAnonymousIdRecord,
      context: data.context,
    };
    const groupUserAssignmentEvent: TrackData = {
      ...partialGroupUserAssignmentEvent,
      ...userIdOrAnonymousIdRecord,
      context: data.context,
    };
    const identifyEvent: IdentifyData | null =
      data.traits && Object.keys(data.traits).length > 0
        ? {
            ...userIdOrAnonymousIdRecord,
            context: data.context,
            traits: data.traits,
            messageId: data.messageId,
            timestamp: data.timestamp,
          }
        : null;

    if (identifyEvent) {
      return [
        userGroupAssignmentEvent,
        groupUserAssignmentEvent,
        identifyEvent,
      ];
    }
    return [userGroupAssignmentEvent, groupUserAssignmentEvent];
  }

  throw Error("Unreachable");
}
