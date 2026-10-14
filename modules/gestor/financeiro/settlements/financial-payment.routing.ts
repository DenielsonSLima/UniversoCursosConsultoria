import type { ContasReceber } from '../financeiro.types';

/** Preserve only the existing integral path explicitly authorized by backend capabilities. */
export function usesLegacyFullSettlement(item: ContasReceber | null | undefined): boolean {
  if (!item || item.paymentSummary?.hasEvents || item.operationCapabilities?.canSettle !== true) return false;
  if (!['PENDENTE', 'VENCIDO'].includes(item.status)) return false;
  const { sourceSystem, provenanceKind } = item.operationCapabilities;
  if (sourceSystem === 'PROESC' || sourceSystem === 'CONFLICT') return false;
  return provenanceKind === 'BANESE_LEGACY_IMPORTED'
    || sourceSystem === 'OTHER'
    || item.gatewayProvider?.toLowerCase() === 'asaas';
}
