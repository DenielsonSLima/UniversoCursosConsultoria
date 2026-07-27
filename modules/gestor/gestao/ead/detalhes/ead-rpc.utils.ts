const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export const normalizeRpcRecord = <T extends object>(value: unknown, operation: string): T => {
  if (isRecord(value)) return value as T;

  if (Array.isArray(value) && value.length === 1 && isRecord(value[0])) {
    return value[0] as T;
  }

  throw new Error(`Resposta inválida recebida em ${operation}.`);
};

export const normalizeRpcList = <T>(value: unknown, operation: string): T[] => {
  if (value == null) return [];
  if (Array.isArray(value)) return value as T[];

  if (isRecord(value)) {
    const nested = value.data ?? value.items ?? value.rows;
    if (Array.isArray(nested)) return nested as T[];
  }

  throw new Error(`Resposta inválida recebida em ${operation}.`);
};
