import { buildTags } from "./templateEditor";

describe("Template Editor - userSegments functionality", () => {
  it("should include userSegments in buildTags output", () => {
    const mockUserSegments = [
      { id: "segment-1", name: "Premium Users" },
      { id: "segment-2", name: "Active Users" },
    ];

    const result = buildTags({
      workspaceId: "test-workspace",
      templateId: "test-template",
      userId: "test-user",
      userSegments: mockUserSegments,
    });

    expect(result).toEqual({
      journeyId: "sample-journey-id",
      messageId: "sample-message-id",
      nodeId: "sample-node-id",
      runId: "sample-run-id",
      templateId: "test-template",
      userId: "test-user",
      workspaceId: "test-workspace",
      userSegments: JSON.stringify(mockUserSegments),
    });
  });

  it("should handle empty userSegments array", () => {
    const result = buildTags({
      workspaceId: "test-workspace",
      templateId: "test-template",
      userId: "test-user",
      userSegments: [],
    });

    expect(result.userSegments).toBe("[]");
  });

  it("should handle undefined userSegments", () => {
    const result = buildTags({
      workspaceId: "test-workspace",
      templateId: "test-template",
      userId: "test-user",
      userSegments: undefined,
    });

    expect(result.userSegments).toBe("[]");
  });

  it("should handle missing userId", () => {
    const mockUserSegments = [{ id: "segment-1", name: "Premium Users" }];

    const result = buildTags({
      workspaceId: "test-workspace",
      templateId: "test-template",
      userSegments: mockUserSegments,
    });

    expect(result.userId).toBe("sample-user-id");
    expect(result.userSegments).toBe(JSON.stringify(mockUserSegments));
  });
});
