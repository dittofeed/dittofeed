import { ChannelType } from "isomorphic-lib/src/types";

import { getDefaultMessageTemplateDefinition } from "./defaultTemplateDefinition";

describe("defaultTemplateDefinition", () => {
  describe("getDefaultMessageTemplateDefinition", () => {
    it("returns a valid default MobilePush definition without throwing", () => {
      const def = getDefaultMessageTemplateDefinition(ChannelType.MobilePush);
      expect(def).toEqual({
        type: ChannelType.MobilePush,
        title: "",
        body: "",
      });
    });

    it("returns valid default definitions for other channels", () => {
      const emailDef = getDefaultMessageTemplateDefinition(ChannelType.Email);
      expect(emailDef.type).toBe(ChannelType.Email);

      const smsDef = getDefaultMessageTemplateDefinition(ChannelType.Sms);
      expect(smsDef.type).toBe(ChannelType.Sms);

      const webhookDef = getDefaultMessageTemplateDefinition(ChannelType.Webhook);
      expect(webhookDef.type).toBe(ChannelType.Webhook);
    });
  });
});
