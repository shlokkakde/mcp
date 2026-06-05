export type JsonToolResult = {
  content: Array<{
    type: "text";
    text: string;
  }>;
};

const sensitiveKeys = new Set([
  "bank_account_last4",
  "tax_id_last4",
  "internal_notes"
]);

function redactSensitivePayrollFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitivePayrollFields(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitiveKeys.has(key) ? "[redacted]" : redactSensitivePayrollFields(entry)
    ])
  );
}

export function jsonResult(data: unknown, options: { redactSensitivePayrollFields?: boolean } = {}): JsonToolResult {
  const safeData = options.redactSensitivePayrollFields ? redactSensitivePayrollFields(data) : data;
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(safeData, null, 2)
      }
    ]
  };
}
