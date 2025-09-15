export const DESCRIBE_TAGS = {
  BLOB_STORAGE: "BLOB_STORAGE",
} as const;

export type DescribeTags = keyof typeof DESCRIBE_TAGS;

export const describeIf = (
  tags: DescribeTags[],
  ...args: Parameters<typeof describe>
) => {
  const describeTags = new Set(process.env.DESCRIBE_TAGS?.split(","));
  for (const tag of tags) {
    if (!describeTags.has(tag)) {
      return describe.skip(...args);
    }
  }
  return describe(...args);
};
