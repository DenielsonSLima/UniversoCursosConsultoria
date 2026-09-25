export interface ReversalOptions {
  recreateAsaas?: boolean;
  reason?: string;
  expectedSettlementId?: string;
}

export interface SettlementReversalResult {
  success: boolean;
  receivable: unknown;
  asaasRecreated?: boolean;
  baneseRecreated?: boolean;
  gatewayRecreated?: boolean;
  gatewayProvider?: string | null;
  requiresDependencyCheckout?: boolean;
  replayed?: boolean;
}

interface Dependencies {
  reverseLocal: (params: {
    p_receivable_id: string;
    p_expected_settlement_id: string | null;
    p_reason: string | null;
  }) => PromiseLike<{ data: unknown; error: unknown }>;
  reverseLegacy: (id: string, params: Omit<ReversalOptions, 'expectedSettlementId'>) => Promise<SettlementReversalResult>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const reverseSettlementWithLocalGuard = async (
  id: string,
  options: ReversalOptions,
  dependencies: Dependencies,
): Promise<SettlementReversalResult> => {
  const { data, error } = await dependencies.reverseLocal({
    p_receivable_id: id,
    p_expected_settlement_id: options.expectedSettlementId || null,
    p_reason: options.reason || null,
  });
  if (error) throw error;
  if (isRecord(data) && data.handled === false) {
    return dependencies.reverseLegacy(id, {
      recreateAsaas: options.recreateAsaas,
      reason: options.reason,
    });
  }
  if (!isRecord(data) || data.handled !== true || data.success !== true
    || !options.expectedSettlementId || data.settlementId !== options.expectedSettlementId
    || typeof data.replayed !== 'boolean'
    || data.asaasRecreated !== false || data.baneseRecreated !== false
    || data.gatewayRecreated !== false || data.gatewayProvider !== null
    || !isRecord(data.receivable) || data.receivable.id !== id
    || data.receivable.manual_settlement_id !== options.expectedSettlementId
    || !['PENDENTE', 'VENCIDO'].includes(String(data.receivable.status))) {
    throw new Error('O servidor não confirmou o estorno local. Atualize a cobrança antes de tentar novamente.');
  }
  return data as unknown as SettlementReversalResult;
};
