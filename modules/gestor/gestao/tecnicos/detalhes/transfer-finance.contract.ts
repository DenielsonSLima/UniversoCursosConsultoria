export type TransferKind = 'INTERNA_TURMA' | 'INTERNA_POLO' | 'EXTERNA_ENVIADA';
export type TransferOrigin = 'PROESC' | 'BANESE_API' | 'BANESE_CNAB' | 'LOCAL' | 'LEGADO';
export type TransferAction = 'PRESERVAR' | 'CONTINUAR_ORIGEM' | 'CANCELAR_LOCAL' | 'AGUARDAR_BANESE' | 'REVISAO_EXTERNA';
export interface TransferIntent {
  matriculaId: string; tipo: TransferKind; motivo: string; dataTransferencia: string;
  turmaDestinoId?: string; instituicaoDestino?: string; observacao?: string;
}
export interface TransferFinancialItem {
  id: string; descricao: string; origem: TransferOrigin; status: string; valor: number;
  vencimento: string | null; referencia: string | null;
  faixa: 'PAGO' | 'VENCIDO' | 'NO_DIA' | 'FUTURO' | 'SEM_DATA'; acao: TransferAction;
}
export interface TransferFinancialSummary {
  preservados: number; locaisACancelar: number; banesePendentes: number; revisaoExterna: number;
}
export interface TransferFinancialPreview {
  versao: 1; matriculaId: string; tipo: TransferKind; dataTransferencia: string;
  turmaDestinoId: string | null; fingerprint: string; itens: TransferFinancialItem[];
  resumo: TransferFinancialSummary;
}
export interface TransferFinancialResult {
  transferenciaId: string; matriculaOrigemId: string; matriculaDestinoId: string | null;
  requestId: string; academicoConcluido: true; replayed: boolean; financeiro: TransferFinancialSummary;
}
export interface TransferFinancialHistory {
  transferenciaId: string; tipo: TransferKind; data: string; alunoNome: string;
  matriculaOrigemId: string; matriculaDestinoId: string | null;
  itens: Array<Omit<TransferFinancialItem, 'faixa' | 'acao'> & { situacao: string }>;
}
const object = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Retorno financeiro da transferência inválido.');
  return value as Record<string, any>;
};
const uuid = (value: unknown) => typeof value === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const kinds = ['INTERNA_TURMA', 'INTERNA_POLO', 'EXTERNA_ENVIADA'];
const origins = ['PROESC', 'BANESE_API', 'BANESE_CNAB', 'LOCAL', 'LEGADO'];
const actions = ['PRESERVAR', 'CONTINUAR_ORIGEM', 'CANCELAR_LOCAL', 'AGUARDAR_BANESE', 'REVISAO_EXTERNA'];
const invalid = () => { throw new Error('Retorno financeiro da transferência incoerente. Recarregue a prévia.'); };
const summary = (value: unknown): TransferFinancialSummary => {
  const row = object(value);
  for (const key of ['preservados', 'locaisACancelar', 'banesePendentes', 'revisaoExterna']) {
    if (!Number.isSafeInteger(row[key]) || row[key] < 0) invalid();
  }
  return row as unknown as TransferFinancialSummary;
};
const item = (value: unknown) => {
  const row = object(value);
  if (!uuid(row.id) || typeof row.descricao !== 'string' || !origins.includes(row.origem)
    || typeof row.status !== 'string' || !Number.isFinite(row.valor) || row.valor < 0
    || (row.vencimento !== null && !/^\d{4}-\d{2}-\d{2}$/.test(row.vencimento))
    || (row.referencia !== null && typeof row.referencia !== 'string')) invalid();
  return row;
};
export function parseTransferPreview(value: unknown): TransferFinancialPreview {
  const row = object(value);
  if (row.versao !== 1 || !uuid(row.matriculaId) || !kinds.includes(row.tipo)
    || !/^\d{4}-\d{2}-\d{2}$/.test(row.dataTransferencia)
    || (row.turmaDestinoId !== null && !uuid(row.turmaDestinoId))
    || !/^[a-f0-9]{64}$/.test(row.fingerprint) || !Array.isArray(row.itens)) invalid();
  for (const value of row.itens) {
    const parsed = item(value);
    if (!actions.includes(parsed.acao) || !['PAGO', 'VENCIDO', 'NO_DIA', 'FUTURO', 'SEM_DATA'].includes(parsed.faixa)) invalid();
    if (['CANCELAR_LOCAL', 'AGUARDAR_BANESE', 'REVISAO_EXTERNA'].includes(parsed.acao)
      && (row.tipo !== 'EXTERNA_ENVIADA' || parsed.faixa !== 'FUTURO')) invalid();
    if ((parsed.acao === 'CANCELAR_LOCAL' && parsed.origem !== 'LOCAL')
      || (parsed.acao === 'AGUARDAR_BANESE' && parsed.origem !== 'BANESE_API')) invalid();
  }
  summary(row.resumo);
  return row as unknown as TransferFinancialPreview;
}
export function parseTransferResult(value: unknown): TransferFinancialResult {
  const row = object(value);
  if (!uuid(row.transferenciaId) || !uuid(row.matriculaOrigemId) || !uuid(row.requestId)
    || (row.matriculaDestinoId !== null && !uuid(row.matriculaDestinoId))
    || row.academicoConcluido !== true || typeof row.replayed !== 'boolean') invalid();
  summary(row.financeiro);
  return row as unknown as TransferFinancialResult;
}
export function parseTransferHistory(value: unknown): TransferFinancialHistory[] {
  if (!Array.isArray(value)) return invalid();
  return value.map((value) => {
    const row = object(value);
    if (!uuid(row.transferenciaId) || !kinds.includes(row.tipo) || typeof row.alunoNome !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(row.data) || !Array.isArray(row.itens)) invalid();
    row.itens.forEach((value: unknown) => {
      const parsed = item(value);
      if (!['PAGAMENTO_PRESERVADO', 'CONTINUIDADE_ORIGEM', 'PRESERVADO_PELO_CORTE', 'CANCELADO_BANESE',
        'REVISAO_BANESE', 'AGUARDANDO_BANESE', 'REVISAO_EXTERNA', 'CANCELADO_LOCAL', 'PRESERVADO'].includes(parsed.situacao)) invalid();
    });
    return row as unknown as TransferFinancialHistory;
  });
}
