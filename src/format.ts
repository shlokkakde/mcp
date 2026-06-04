export type JsonToolResult = {
  content: Array<{
    type: "text";
    text: string;
  }>;
};

export function jsonResult(data: unknown): JsonToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}
