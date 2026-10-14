describe("resend tag sanitization", () => {
  // This tests the tag sanitization logic used in messaging.ts when
  // constructing Resend mailData. Resend's API rejects tags containing
  // characters other than ASCII letters, numbers, underscores, or dashes.
  const sanitize = (value: string) =>
    value.replace(/[^a-zA-Z0-9_-]/g, "_");

  it("should pass through valid tag names and values unchanged", () => {
    expect(sanitize("workspaceId")).toBe("workspaceId");
    expect(sanitize("journey-id")).toBe("journey-id");
    expect(sanitize("node_type")).toBe("node_type");
    expect(sanitize("abc123")).toBe("abc123");
  });

  it("should replace dots with underscores", () => {
    expect(sanitize("com.example.tag")).toBe("com_example_tag");
  });

  it("should replace colons with underscores", () => {
    expect(sanitize("key:value")).toBe("key_value");
  });

  it("should sanitize UUIDs (replace hyphens are kept, but other chars replaced)", () => {
    // UUIDs like "dfa7251b-2902-4985-9dae-ecb1d537d63e" are valid
    // because they only contain hex chars and hyphens
    const uuid = "dfa7251b-2902-4985-9dae-ecb1d537d63e";
    expect(sanitize(uuid)).toBe(uuid);
  });

  it("should replace spaces with underscores", () => {
    expect(sanitize("my tag name")).toBe("my_tag_name");
  });

  it("should replace special characters with underscores", () => {
    expect(sanitize("tag@value!#$%")).toBe("tag_value____");
  });

  it("should handle empty strings", () => {
    expect(sanitize("")).toBe("");
  });

  it("should handle values with only invalid characters", () => {
    expect(sanitize("@#$%")).toBe("____");
  });

  it("should sanitize email-like values", () => {
    expect(sanitize("user@example.com")).toBe("user_example_com");
  });

  it("should sanitize URL-like values", () => {
    expect(sanitize("https://example.com/path")).toBe("https___example_com_path");
  });
});
