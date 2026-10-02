export type CaixaReviewContext = 'MONTHLY' | 'FUTURE';
export interface CaixaReviewItem {
  id: string;
  alunoNome: string | null;
  turmaNome: string | null;
  turmaCodigo: string | null;
  matriculaCodigo: string | null;
  proescRef: string | null;
  vencimento: string;
  valorNominal: string;
  motivos: Array<{ codigo: string; descricao: string }>;
  fonte: string | null;
  observadoEm: string | null;
}
export interface CaixaReviewPage {
  context: CaixaReviewContext;
  competencia: string;
  poloId: string | null;
  dataCorte: string;
  geradoEm: string;
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  totalNominal: string;
  items: CaixaReviewItem[];
}
export interface CaixaReviewRequest {
  poloId: string | null;
  competencia: string;
  context: CaixaReviewContext;
  page: number;
  pageSize: number;
}

const fail = (): never => { throw new Error('Resposta de pendências incompatível com o recorte solicitado.'); };
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
};
const keys = (value: Record<string, unknown>, expected: string[]) => {
  if (Object.keys(value).length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) fail();
};
const string = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const nullableString = (value: unknown) => value === null || string(value);
const money = (value: unknown) => typeof value === 'string' && /^\d+\.\d{2}$/.test(value);
const integer = (value: unknown, min: number) => Number.isSafeInteger(value) && Number(value) >= min;
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const timestamp = (value: unknown) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));

export function parseCaixaReviewPage(value: unknown, request: CaixaReviewRequest): CaixaReviewPage {
  const envelope = record(value);
  keys(envelope, ['success', 'data']);
  if (envelope.success !== true) return fail();
  const data = record(envelope.data);
  keys(data, ['context', 'competencia', 'poloId', 'dataCorte', 'geradoEm', 'page', 'pageSize',
    'totalPages', 'totalCount', 'totalNominal', 'items']);
  if (data.context !== request.context || data.competencia !== request.competencia
    || data.poloId !== request.poloId || data.page !== request.page || data.pageSize !== request.pageSize
    || !date(data.dataCorte) || !timestamp(data.geradoEm) || !integer(data.totalPages, 1)
    || !integer(data.totalCount, 0) || !money(data.totalNominal)
    || !Array.isArray(data.items) || data.items.length > request.pageSize) return fail();
  // Apenas verifica o contrato de paginação; a navegação usa os números da RPC.
  const total = Number(data.totalCount);
  const expectedLength = Math.min(request.pageSize, Math.max(0, total - (request.page - 1) * request.pageSize));
  const [year, month] = request.competencia.split('-').map(Number);
  const periodEnd = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  if (data.totalPages !== Math.max(1, Math.ceil(total / request.pageSize))
    || data.items.length !== expectedLength || String(data.dataCorte) >= periodEnd) return fail();
  const ids = new Set<string>();
  for (const raw of data.items) {
    const item = record(raw);
    keys(item, ['id', 'alunoNome', 'turmaNome', 'turmaCodigo', 'matriculaCodigo', 'proescRef',
      'vencimento', 'valorNominal', 'motivos', 'fonte', 'observadoEm']);
    if (!string(item.id) || ids.has(item.id) || !date(item.vencimento) || !money(item.valorNominal)
      || !nullableString(item.fonte) || !(item.observadoEm === null || timestamp(item.observadoEm))
      || !['alunoNome', 'turmaNome', 'turmaCodigo', 'matriculaCodigo', 'proescRef'].every((key) => nullableString(item[key]))
      || !Array.isArray(item.motivos) || item.motivos.length === 0) return fail();
    ids.add(item.id);
    for (const rawReason of item.motivos) {
      const reason = record(rawReason);
      keys(reason, ['codigo', 'descricao']);
      if (!string(reason.codigo) || !string(reason.descricao)) return fail();
    }
  }
  return data as unknown as CaixaReviewPage;
}
