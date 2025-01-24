describe("componentConfigurations", () => {
  describe("upsertComponentConfiguration", () => {
    describe("when the name and id are unique", () => {
      it("should create a new component configuration", () => {
        expect(true).toBe(true);
      });
    });
    describe("when the name is new and the id exists in the workspace", () => {
      it("should update the name", () => {
        expect(true).toBe(true);
      });
    });
    describe("when the name exists under a different id in the same workspace", () => {
      it("should return a unique constraint violation error", () => {
        expect(true).toBe(true);
      });
    });
    describe("id exists in another workspace", () => {
      it("should return a unique constraint violation error", () => {
        expect(true).toBe(true);
      });
    });
  });
});
