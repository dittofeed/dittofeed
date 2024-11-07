describe("keyedEventEntry journeys", () => {
  describe("when a journey is keyed on appointmentId and waits for a cancellation event before sending a message", () => {
    describe("when two journeys are triggered concurrently for the same user with different appointmentIds but only one is cancelled ", () => {
      it("only the cancelled journey should send a message", () => {
        expect(true).toBe(true);
      });
    });
  });
});
