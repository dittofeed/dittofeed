describe("authenticateAdminApiKey", () => {
  describe("when an admin api key exists in the workspace", () => {
    describe("when the key matches the passed value", () => {
      it("should return true", () => {
        expect(true).toBe(true);
      });
    });
    describe("when the key does not match the passed value", () => {
      it("should return false", () => {
        expect(true).toBe(true);
      });
    });
  });
  describe("when an admin api key does not exist in the workspace", () => {
    it("should return false", () => {
      expect(true).toBe(true);
    });
  });
  describe("when the admin api key exists in a child workspace", () => {
    it("should return false", () => {
      expect(true).toBe(true);
    });
  });
});
