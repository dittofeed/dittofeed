describe("reEnter", () => {
  describe("when canRunMultiple is true and the journey is run twice", () => {
    it("should run the journey twice to completion", () => {});
  });

  describe("when canRunMultiple is false and the journey is run twice", () => {
    it("should run the journey once to completion", () => {});
  });

  describe("when canRunMultiple is true and it is configured to re-enter", () => {
    describe("when the user is in the segment", () => {
      it("should run to completion and continue as new", () => {});
    });
    describe("when the user is not in the segment", () => {
      it("should run to completion and not continue as new", () => {});
    });
  });
});
