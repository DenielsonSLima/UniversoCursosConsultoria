import type { IndividualCancelResult, IndividualIssueResult } from '../individual/nfse-individual.types';
export interface NfseFiscalNotice { type: 'success' | 'error' | 'info'; title: string; message: string }
const detail = (result: { message: string; codes?: readonly string[] }) => [result.codes?.length ? `Código(s): ${result.codes.join(', ')}.` : '', result.message].filter(Boolean).join(' ');
export function individualIssueNotice(result: IndividualIssueResult): NfseFiscalNotice {
  if (result.state === 'AUTHORIZED') return { type: 'success', title: `NFS-e nº ${result.number} autorizada`, message: result.message };
  if (result.state === 'REJECTED') return { type: 'error', title: 'Emissão rejeitada', message: detail(result) };
  return { type: 'info', title: result.state === 'AWAITING_CONFIRMATION' ? 'Emissão aguardando confirmação'
    : result.state === 'PREVIEWED' ? 'NFS-e ainda não enviada' : 'Emissão pendente de revisão', message: detail(result) };
}
export function individualCancelNotice(result: IndividualCancelResult): NfseFiscalNotice {
  if (result.state === 'CANCELLED') return { type: 'success', title: `NFS-e nº ${result.payload.number} cancelada`, message: result.message };
  return { type: result.state === 'CANCELLATION_REJECTED' ? 'error' : 'info', title: result.state === 'CANCELLATION_REJECTED' ? 'Cancelamento rejeitado'
    : result.state === 'AWAITING_ANALYSIS' ? 'Cancelamento aguardando análise' : result.state === 'PREVIEWED' ? 'Cancelamento ainda não enviado'
      : result.state === 'BLOCKED' ? 'Cancelamento pendente de revisão' : 'Cancelamento aguardando confirmação', message: detail(result) };
}
