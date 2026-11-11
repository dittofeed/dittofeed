import {
  BroadcastResourceAllVersions,
  BroadcastResourceVersionEnum,
  MinimalJourneysResource,
  SearchDeliveriesResponseItem,
} from "isomorphic-lib/src/types";

export interface DeliveryOrigin {
  originId?: string;
  originType?: "broadcast" | "journey" | "broadcastV2";
  originName?: string;
}

export function getOrigin({
  journeys,
  broadcasts,
  item,
}: {
  item: SearchDeliveriesResponseItem;
  journeys: MinimalJourneysResource[];
  broadcasts: BroadcastResourceAllVersions[];
}): DeliveryOrigin | null {
  for (const broadcast of broadcasts) {
    if (
      (!broadcast.version ||
        broadcast.version === BroadcastResourceVersionEnum.V1) &&
      broadcast.journeyId &&
      broadcast.journeyId === item.journeyId
    ) {
      return {
        originId: broadcast.id,
        originType: "broadcast",
        originName: broadcast.name,
      };
    }
    // A V2 broadcast's deliveries carry its id, so match on that. Only
    // deliveries that carry neither id fall back to the message template, as a
    // journey or another broadcast can send the same template.
    if (
      broadcast.version === BroadcastResourceVersionEnum.V2 &&
      (item.broadcastId
        ? broadcast.id === item.broadcastId
        : !item.journeyId && broadcast.messageTemplateId === item.templateId)
    ) {
      return {
        originId: broadcast.id,
        originType: "broadcastV2",
        originName: broadcast.name,
      };
    }
  }
  for (const journey of journeys) {
    if (journey.id === item.journeyId) {
      return {
        originId: journey.id,
        originType: "journey",
        originName: journey.name,
      };
    }
  }
  return null;
}
