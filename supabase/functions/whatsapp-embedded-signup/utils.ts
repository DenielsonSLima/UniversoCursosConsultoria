export const trimOrNull = (value: unknown) => {
  const text = String(value || "").trim();
  return text || null;
};

export const normalizeGraphVersion = (value: unknown) => {
  const version = String(value || "v25.0").trim();
  return /^v\d+\.\d+$/.test(version) ? version : "v25.0";
};

export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

export const getNestedText = (source: Record<string, unknown>, key: string) =>
  trimOrNull(source[key]);
