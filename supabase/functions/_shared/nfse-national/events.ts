import { digits, exactKeys, NFSE_NAMESPACE, requireContract, tag, timestamp,
  type UnsignedFiscalXml, xmlText } from './xml.ts';

export type CancellationEventCode = '101101' | '101103';
export interface CancellationInput {
  environment: 'HOMOLOGACAO' | 'PRODUCAO';
  applicationVersion: string;
  occurredAt: string;
  accessKey: string;
  author: { type: 'CPF' | 'CNPJ'; value: string };
  eventCode: CancellationEventCode;
  reasonCode: '1' | '2' | '9';
  reason: string;
}

/** Only emitent-authored requests; municipality-only events cannot be forged here. */
export function buildNationalCancellation(input: CancellationInput): UnsignedFiscalXml {
  exactKeys(input, ['environment', 'applicationVersion', 'occurredAt', 'accessKey', 'author',
    'eventCode', 'reasonCode', 'reason']);
  requireContract(input.environment === 'HOMOLOGACAO' || input.environment === 'PRODUCAO', 'INVALID_ENVIRONMENT');
  requireContract(input.eventCode === '101101' || input.eventCode === '101103', 'UNSUPPORTED_EVENT');
  requireContract(['1', '2', '9'].includes(input.reasonCode), 'INVALID_CANCELLATION_REASON');
  exactKeys(input.author, ['type', 'value']);
  requireContract(input.author.type === 'CPF' || input.author.type === 'CNPJ', 'UNSUPPORTED_TAX_ID');
  const accessKey = digits(input.accessKey, 50);
  const author = digits(input.author.value, input.author.type === 'CPF' ? 11 : 14);
  xmlText(input.reason, 15, 255);
  // Anexo II layout and RN E1827: PRE + key(50) + code(6), without sequence.
  const referenceId = `PRE${accessKey}${input.eventCode}`;
  const name = `e${input.eventCode}`;
  const description = input.eventCode === '101101' ? 'Cancelamento de NFS-e' :
    'Solicitação de Análise Fiscal para Cancelamento de NFS-e';
  return {
    kind: input.eventCode === '101101' ? 'CANCELLATION' : 'CANCELLATION_REQUEST',
    environment: input.environment, schemaVersion: '1.01', referenceId,
    xml: `<?xml version="1.0" encoding="UTF-8"?><pedRegEvento xmlns="${NFSE_NAMESPACE}" versao="1.01">` +
      `<infPedReg Id="${referenceId}">${tag('tpAmb', input.environment === 'HOMOLOGACAO' ? '2' : '1')}` +
      tag('verAplic', input.applicationVersion) + tag('dhEvento', timestamp(input.occurredAt)) +
      tag(input.author.type === 'CPF' ? 'CPFAutor' : 'CNPJAutor', author) + tag('chNFSe', accessKey) +
      `<${name}>${tag('xDesc', description)}${tag('cMotivo', input.reasonCode)}` +
      `${tag('xMotivo', input.reason)}</${name}></infPedReg></pedRegEvento>`,
  };
}

export interface AcceptedNationalEvent {
  accessKey: string;
  environment: 'HOMOLOGACAO' | 'PRODUCAO';
  code: string;
  sequence: string;
  id: string;
}

/** A successful request for analysis does not mean the invoice was cancelled. */
export function projectCancellationState(accessKey: string, environment: string,
  events: readonly AcceptedNationalEvent[]): 'UNCHANGED' | 'AWAITING_ANALYSIS' | 'CANCELLED' |
    'SUBSTITUTED' | 'ANALYSIS_DENIED' {
  digits(accessKey, 50);
  const codes = new Set<string>();
  for (const event of events) {
    requireContract(event.accessKey === accessKey && event.environment === environment &&
      /^\d{6}$/.test(event.code) && /^\d{3}$/.test(event.sequence) &&
      event.id === `EVT${accessKey}${event.code}${event.sequence}`, 'EVENT_IDENTITY_MISMATCH');
    codes.add(event.code);
  }
  if (codes.has('105102')) return 'SUBSTITUTED';
  if (['101101', '105104', '305101'].some((code) => codes.has(code))) return 'CANCELLED';
  if (codes.has('105105')) return 'ANALYSIS_DENIED';
  if (codes.has('101103')) return 'AWAITING_ANALYSIS';
  return 'UNCHANGED';
}
