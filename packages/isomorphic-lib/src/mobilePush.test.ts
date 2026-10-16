import {
  defaultMobilePushDefinition,
  isMobilePushProviderType,
  MobilePushProviderTypeSet,
} from "./mobilePush";
import { ChannelType, MobilePushProviderType } from "./types";

describe("defaultMobilePushDefinition", () => {
  it("returns a MobilePush template definition", () => {
    expect(defaultMobilePushDefinition()).toEqual({
      type: ChannelType.MobilePush,
      title: "Example title",
      body: "Example message to {{ user.firstName }}",
    });
  });
});

describe("isMobilePushProviderType", () => {
  it("accepts every known provider type", () => {
    expect(isMobilePushProviderType(MobilePushProviderType.Firebase)).toBe(true);
    expect(isMobilePushProviderType(MobilePushProviderType.Test)).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isMobilePushProviderType("Nope")).toBe(false);
    expect(isMobilePushProviderType(undefined)).toBe(false);
    expect(isMobilePushProviderType(null)).toBe(false);
    expect(isMobilePushProviderType(1)).toBe(false);
  });
});

describe("MobilePushProviderTypeSet", () => {
  it("contains exactly the known provider types", () => {
    expect([...MobilePushProviderTypeSet].sort()).toEqual(
      [MobilePushProviderType.Firebase, MobilePushProviderType.Test].sort(),
    );
  });
});
