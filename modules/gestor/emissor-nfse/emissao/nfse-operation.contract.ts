import { NfseContractError } from '../services/nfse.errors';
import { record, string } from '../services/nfse.validation';
export interface NfseEmissionSource { kind: 'PARTNER_SERVICE' | 'ACADEMIC_QUEUE'; id: string }
export interface NfseOperationReference {
  operationId?: string | null; requestId?: string | null; cancelPreviewId?: string | null; state?: string | null;
  number?: string | null; accessKey?: string | null; message?: string | null;
  sourceKind?: NfseEmissionSource['kind'] | null; sourceId?: string | null;
}
const uuid = (value: unknown) => { const id = string(value); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new NfseContractError(); return id; };
export function emissionSource(value: NfseEmissionSource): NfseEmissionSource {
  if (!['PARTNER_SERVICE', 'ACADEMIC_QUEUE'].includes(value.kind)) throw new NfseContractError();
  return { kind: value.kind, id: uuid(value.id) };
}
export function operationReference(value: unknown): NfseOperationReference {
  const row = record(value), operationId = row.operationId == null ? null : uuid(row.operationId), requestId = row.requestId == null ? null : uuid(row.requestId);
  if (Boolean(operationId) !== Boolean(requestId)) throw new NfseContractError();
  const cancelPreviewId = row.cancelPreviewId == null ? null : uuid(row.cancelPreviewId);
  const source = row.sourceKind == null && row.sourceId == null ? null : emissionSource({ kind: row.sourceKind as NfseEmissionSource['kind'], id: row.sourceId as string });
  if (cancelPreviewId && !operationId) throw new NfseContractError();
  const nullable = (value: unknown) => value == null ? null : string(value);
  const state = nullable(row.state), number = nullable(row.number), accessKey = nullable(row.accessKey), message = nullable(row.message);
  if (state && !/^[A-Z_]{1,40}$/.test(state) || operationId && number && !/^[1-9][0-9]{0,12}$/.test(number)
    || operationId && accessKey && !/^[0-9]{50}$/.test(accessKey) || message && message.length > 500) throw new NfseContractError();
  return { operationId, requestId, cancelPreviewId, state, number, accessKey, message, sourceKind: source?.kind || null, sourceId: source?.id || null };
}
export function operationLabel(state?: string | null): string {
  return state ? ({ PREVIEWED: 'Não enviada (preparada)', PROCESSING: 'Em processamento', AUTHORIZED: 'Emitida', REJECTED: 'Rejeitada',
    AWAITING_CONFIRMATION: 'Aguardando confirmação', BLOCKED: 'Dados pendentes', CANCELLED: 'Cancelada', CANCELLATION_PENDING: 'Cancelamento em consulta',
    CANCELLATION_REJECTED: 'Cancelamento rejeitado', AWAITING_ANALYSIS: 'Aguardando análise fiscal' }[state] || 'Consultar situação fiscal') : 'Preparado';
}
