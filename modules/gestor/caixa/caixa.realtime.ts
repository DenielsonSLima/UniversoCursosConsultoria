type RealtimePayload = {
  new?: unknown;
};

export type CaixaRealtimeInvalidationTarget = 'FINANCEIRO' | 'PATRIMONIO';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const getCaixaRealtimeInvalidationTarget = (
  payload: RealtimePayload,
): CaixaRealtimeInvalidationTarget => (
  isRecord(payload?.new) && payload.new.source_table === 'patrimonios'
    ? 'PATRIMONIO'
    : 'FINANCEIRO'
);

/**
 * Retorna os escopos de cache afetados por um evento financeiro.
 *
 * Todo movimento de um polo também altera o consolidado. Eventos sem polo
 * pertencem somente ao consolidado. `null` sinaliza payload incompleto e pede
 * a invalidação conservadora do prefixo inteiro.
 */
export const getCaixaRealtimeInvalidationScopes = (
  payload: RealtimePayload,
): readonly string[] | null => {
  if (!isRecord(payload?.new) || !('polo_id' in payload.new)) return null;

  const poloId = payload.new.polo_id;
  if (poloId === null) return ['todos'];
  if (typeof poloId !== 'string' || poloId.trim() === '') return null;

  return [poloId, 'todos'];
};
