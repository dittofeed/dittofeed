import {
  BatchGroupData,
  BatchIdentifyData,
  BatchTrackData,
  EventType,
  GroupData,
  InternalEventType,
  GroupUserAssignmentProperties,
  IdentifyData,
  TrackData,
  TrackEventProperties,
  UserGroupAssignmentProperties,
} from "../types";

// Function overload signatures
export function splitGroupEvents(
  data: GroupData,
): Promise<[TrackData, TrackData, IdentifyData?]>;
export function splitGroupEvents(
  data: BatchGroupData,
): Promise<[BatchTrackData, BatchTrackData, BatchIdentifyData?]>;

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
 * @returns An array where the first two elements are track events and the third optional element is an identify event
 */
export function splitGroupEvents(
  data: GroupData | BatchGroupData,
): Promise<
  [
    TrackData | BatchTrackData,
    TrackData | BatchTrackData,
    (IdentifyData | BatchIdentifyData)?,
  ]
> {
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

  throw new Error("Not implemented");
}
