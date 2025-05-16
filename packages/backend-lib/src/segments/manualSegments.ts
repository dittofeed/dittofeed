import {
  GetManualSegmentStatusRequest,
  GetManualSegmentStatusResponse,
  UpdateManualSegmentUsersRequest,
  UpdateManualSegmentUsersResponse,
} from "../types";

export async function updateManualSegmentUsers({
  workspaceId,
  segmentId,
  userIds,
}: UpdateManualSegmentUsersRequest): Promise<UpdateManualSegmentUsersResponse> {
  throw new Error("Not implemented");
}

export async function getManualSegmentStatus({
  workspaceId,
  segmentId,
}: GetManualSegmentStatusRequest): Promise<GetManualSegmentStatusResponse> {
  // TODO use periods to get the status
  throw new Error("Not implemented");
}
