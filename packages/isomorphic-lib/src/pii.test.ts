import {
  guessPiiCategory,
  isMaskedPii,
  maskPiiValue,
  PII_MASKED,
} from "./pii";

describe("pii", () => {
  describe("maskPiiValue", () => {
    it("returns the literal MASKED placeholder", () => {
      expect(maskPiiValue()).toBe("MASKED");
      expect(PII_MASKED).toBe("MASKED");
    });
  });

  describe("isMaskedPii", () => {
    it("recognises the placeholder", () => {
      expect(isMaskedPii(PII_MASKED)).toBe(true);
    });

    it("rejects any other value", () => {
      expect(isMaskedPii("a@b.com")).toBe(false);
      expect(isMaskedPii("masked")).toBe(false);
      expect(isMaskedPii(null)).toBe(false);
      expect(isMaskedPii(undefined)).toBe(false);
    });
  });

  describe("guessPiiCategory", () => {
    it.each([
      ["email", "Email"],
      ["Email", "Email"],
      ["e-mail", "Email"],
      ["phone_number", "Phone"],
      ["firstName", "Name"],
      ["address1", "Address"],
      ["postalCode", "Address"],
      ["ssn", "GovernmentId"],
      ["dateOfBirth", "DateOfBirth"],
      ["ip_address", "IpAddress"],
      ["cardNumber", "Financial"],
    ])("maps %s to %s", (fieldName, expected) => {
      expect(guessPiiCategory(fieldName)).toBe(expected);
    });

    it("returns null for fields that are not obviously PII", () => {
      expect(guessPiiCategory("plan")).toBeNull();
      expect(guessPiiCategory("createdAt")).toBeNull();
    });
  });
});
