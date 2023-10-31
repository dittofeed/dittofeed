import { SearchDeliveriesRequest, SearchDeliveriesResponse } from "./types";

export async function searchDeliveries({
  workspaceId,
}: SearchDeliveriesRequest): Promise<SearchDeliveriesResponse> {
  return {
    workspaceId,
    items: [],
  };
}
