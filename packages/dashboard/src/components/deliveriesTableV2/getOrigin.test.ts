import {
  BroadcastConfigTypeEnum,
  BroadcastResource,
  BroadcastResourceV2,
  BroadcastResourceVersionEnum,
  BroadcastV2StatusEnum,
  ChannelType,
  InternalEventType,
  MinimalJourneysResource,
  SearchDeliveriesResponseItem,
  SmsProviderType,
} from "isomorphic-lib/src/types";

import { getOrigin } from "./getOrigin";

const WORKSPACE_ID = "workspace-1";
const SHARED_TEMPLATE_ID = "template-shared";

function buildDelivery({
  templateId,
  journeyId,
  broadcastId,
}: {
  templateId: string;
  journeyId?: string;
  broadcastId?: string;
}): SearchDeliveriesResponseItem {
  return {
    status: InternalEventType.MessageSent,
    variant: {
      type: ChannelType.Sms,
      provider: { type: SmsProviderType.Test },
      to: "+15555550100",
      body: "Hello",
    },
    sentAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    userId: "user-1",
    originMessageId: "message-1",
    templateId,
    journeyId,
    broadcastId,
  };
}

function buildBroadcastV2({
  id,
  name,
  messageTemplateId,
}: {
  id: string;
  name: string;
  messageTemplateId: string;
}): BroadcastResourceV2 {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    name,
    messageTemplateId,
    config: {
      type: BroadcastConfigTypeEnum.V2,
      message: { type: ChannelType.Email },
    },
    status: BroadcastV2StatusEnum.Completed,
    createdAt: 0,
    updatedAt: 0,
    version: BroadcastResourceVersionEnum.V2,
  };
}

function buildBroadcastV1({
  id,
  name,
  journeyId,
}: {
  id: string;
  name: string;
  journeyId: string;
}): BroadcastResource {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    name,
    journeyId,
    status: "Triggered",
    createdAt: 0,
    updatedAt: 0,
    version: BroadcastResourceVersionEnum.V1,
  };
}

describe("getOrigin", () => {
  const journey: MinimalJourneysResource = {
    id: "journey-1",
    name: "Welcome journey",
  };

  describe("when a V2 broadcast uses the same template as a journey", () => {
    const broadcast = buildBroadcastV2({
      id: "broadcast-1",
      name: "Test broadcast",
      messageTemplateId: SHARED_TEMPLATE_ID,
    });

    test("attributes a delivery sent by the journey to the journey", () => {
      const item = buildDelivery({
        templateId: SHARED_TEMPLATE_ID,
        journeyId: journey.id,
      });

      expect(
        getOrigin({ item, journeys: [journey], broadcasts: [broadcast] }),
      ).toEqual({
        originId: journey.id,
        originType: "journey",
        originName: journey.name,
      });
    });

    test("attributes a delivery sent by the broadcast to the broadcast", () => {
      const item = buildDelivery({
        templateId: SHARED_TEMPLATE_ID,
        broadcastId: broadcast.id,
      });

      expect(
        getOrigin({ item, journeys: [journey], broadcasts: [broadcast] }),
      ).toEqual({
        originId: broadcast.id,
        originType: "broadcastV2",
        originName: broadcast.name,
      });
    });

    test("matches a delivery that carries neither id to the broadcast by template", () => {
      const item = buildDelivery({ templateId: SHARED_TEMPLATE_ID });

      expect(
        getOrigin({ item, journeys: [journey], broadcasts: [broadcast] }),
      ).toEqual({
        originId: broadcast.id,
        originType: "broadcastV2",
        originName: broadcast.name,
      });
    });
  });

  describe("when several V2 broadcasts use the same template", () => {
    const first = buildBroadcastV2({
      id: "broadcast-1",
      name: "First broadcast",
      messageTemplateId: SHARED_TEMPLATE_ID,
    });
    const second = buildBroadcastV2({
      id: "broadcast-2",
      name: "Second broadcast",
      messageTemplateId: SHARED_TEMPLATE_ID,
    });

    test("attributes a delivery to the broadcast whose id it carries", () => {
      const item = buildDelivery({
        templateId: SHARED_TEMPLATE_ID,
        broadcastId: second.id,
      });

      expect(
        getOrigin({ item, journeys: [], broadcasts: [first, second] }),
      ).toEqual({
        originId: second.id,
        originType: "broadcastV2",
        originName: second.name,
      });
    });

    test("does not match a delivery whose broadcast is not listed", () => {
      const item = buildDelivery({
        templateId: SHARED_TEMPLATE_ID,
        broadcastId: "broadcast-3",
      });

      expect(
        getOrigin({ item, journeys: [], broadcasts: [first, second] }),
      ).toBeNull();
    });
  });

  test("matches a delivery to a V1 broadcast by journey id", () => {
    const broadcast = buildBroadcastV1({
      id: "broadcast-1",
      name: "V1 broadcast",
      journeyId: "journey-v1",
    });
    const item = buildDelivery({
      templateId: "template-1",
      journeyId: "journey-v1",
    });

    expect(
      getOrigin({ item, journeys: [journey], broadcasts: [broadcast] }),
    ).toEqual({
      originId: broadcast.id,
      originType: "broadcast",
      originName: broadcast.name,
    });
  });

  test("returns null when no broadcast or journey matches", () => {
    const broadcast = buildBroadcastV2({
      id: "broadcast-1",
      name: "Test broadcast",
      messageTemplateId: "template-other",
    });
    const item = buildDelivery({
      templateId: SHARED_TEMPLATE_ID,
      journeyId: "journey-unknown",
    });

    expect(
      getOrigin({ item, journeys: [journey], broadcasts: [broadcast] }),
    ).toBeNull();
  });
});
