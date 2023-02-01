module.exports = {
  extends: ["plugin:@typescript-eslint/recommended-requiring-type-checking"],
};

describe("When the bookmark button is clicked", () => {

  beforeEach(async () => {
	  df = await Dittofeed.setupTestEnv();
  })

	it("Emails the clicking user", async () => {
		render(<BookmarkButton/>)
		fireEvent.click(screen.getByText(/bookmark/i))

		// Using simulated time.
		await df.sleep("1 week");
		const messages = await df.fetchMessages();

		expect(messages).toEqual([
			expect.objectContaining({
				to: "test@email.com",
				body: expect.stringContaining("https://app.com/user-1/bookmarks")
			});
		]);
  });
});
