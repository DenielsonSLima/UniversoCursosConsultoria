import { buildQueryUrl, object, ProescError } from './contract.ts';
import { v2Headers } from './connection-contract.ts';

export type V2Credentials = { token: string; wafHeader?: string; transport?: typeof fetch; signal?: AbortSignal };
export type V2InvoiceQuery = { unitId: string; year: number; month: number; page: number; personId?: string };
export type V2InvoiceStatus = 'PAGA' | 'VENCIDO' | 'EM ABERTO'
  | 'PAGAMENTO PARCIAL' | 'PAGAMENTO SUPERIOR' | 'UNKNOWN';
export interface ProescV2Invoice {
  invoiceId: string;
  personId: string | null;
  sourceEnrollmentId: string | null;
  sourceClassId: string | null;
  /** Process-only. Hash and remove before persistence, telemetry or logs. */
  studentDocument: string | null;
  unitId: string;
  dueDate: string;
  principalCents: number;
  paidCents: number | null;
  paymentDate: string | null;
  sourceStatus: V2InvoiceStatus;
  groupId: string | null;
  order: number | null;
  groupTotal: number | null;
  financialConfiguration: {
    fixedDiscountCents: number | null;
    earlyDiscountCents: number | null;
    earlyDiscountPercentage: string | null;
    fineRate: string | null;
    interestRate: string | null;
  };
  reviewReasons: string[];
}

const invalid = (message = 'Resposta Proesc V2 inválida ou incompleta.'): never => {
  throw new ProescError(message, 502);
};

export function v2Identifier(value: unknown): string {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) invalid();
  if (typeof value !== 'number' && typeof value !== 'string') invalid();
  const text = String(value);
  if (!/^[1-9]\d{0,17}$/.test(text)) invalid();
  return text;
}
const optionalId = (value: unknown) => value === undefined || value === null || value === '' ? null : v2Identifier(value);
const integer = (value: unknown, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) invalid();
  return value as number;
};
const optionalInteger = (value: unknown) => value === undefined || value === null ? null : integer(value, 1, 10000);

/** Accept the observed PT-BR representation and the documented decimal form. */
export function proescV2MoneyCents(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') invalid();
  const input = String(value);
  let text = input;
  if (/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(input)) text = input.replaceAll('.', '').replace(',', '.');
  if (!/^-?\d{1,13}(?:\.\d{1,2})?$/.test(text)) invalid('Valor monetário Proesc V2 inválido.');
  const negative = text.startsWith('-');
  const [whole, decimal = ''] = (negative ? text.slice(1) : text).split('.');
  const cents = (BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0'))) * (negative ? -1n : 1n);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) invalid();
  return Number(cents);
}
const optionalMoney = (value: unknown) => value === undefined || value === null || value === '' ? null : proescV2MoneyCents(value);
const configuredMoney = (value: unknown) => {
  const cents = optionalMoney(value);
  if (cents !== null && (cents < 0 || cents > 99_999_999_999_999)) invalid();
  return cents;
};
const rate = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value);
  if (!/^\d{1,5}(?:[.,]\d{1,8})?$/.test(text)) invalid();
  return text.replace(',', '.');
};
export function v2Date(value: unknown, optional = false): string | null {
  if (optional && (value === null || value === undefined || value === '')) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid();
  return value as string;
}
export function v2Document(value: unknown): string | null {
  // Numeric or short documents have lost leading-zero information.
  if (typeof value !== 'string') return null;
  if (/^\d{11}$/.test(value)) return value;
  return /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value) ? value.replace(/[.-]/g, '') : null;
}

export function normalizeProescV2Invoice(value: unknown, query: V2InvoiceQuery): ProescV2Invoice {
  const row = object(value);
  const enrollment = object(row.matricula);
  const person = object(row.pessoa);
  const discounts = object(row.discounts);
  const early = object(discounts.early_payment_discount);
  const fees = object(row.late_payment_fees);
  const invoiceId = v2Identifier(row.invoice_id);
  const personId = optionalId(row.person_id);
  const nestedPersonId = optionalId(person.id);
  const sourceEnrollmentId = optionalId(enrollment.id);
  const sourceClassId = optionalId(enrollment.turma_id);
  const studentDocument = v2Document(person.cadastro_nacional);
  const dueDate = v2Date(row.due_date)!;
  const period = `${query.year}-${String(query.month).padStart(2, '0')}`;
  if (!dueDate.startsWith(`${period}-`)) invalid('Vencimento fora do período solicitado à V2.');
  if (query.personId && personId !== query.personId) invalid('Pessoa diferente do filtro solicitado à V2.');
  const principalCents = proescV2MoneyCents(row.original_invoice_amount);
  const paidCents = optionalMoney(row.paid_invoice_amount);
  if (principalCents < 0 || principalCents > 99_999_999_999_999
    || (paidCents !== null && (paidCents < 0 || paidCents > 99_999_999_999_999))) invalid();
  const paymentDate = v2Date(row.payment_date, true);
  const known = ['PAGA', 'VENCIDO', 'EM ABERTO', 'PAGAMENTO PARCIAL', 'PAGAMENTO SUPERIOR'];
  const sourceStatus: V2InvoiceStatus = typeof row.status === 'string' && known.includes(row.status)
    ? row.status as V2InvoiceStatus : 'UNKNOWN';
  const reviewReasons: string[] = [];
  if (!personId || !sourceEnrollmentId || !sourceClassId || !studentDocument) reviewReasons.push('MISSING_IDENTITY');
  if (personId && nestedPersonId && personId !== nestedPersonId) reviewReasons.push('CONFLICTING_PERSON_IDENTITY');
  if (sourceStatus === 'UNKNOWN') reviewReasons.push('UNKNOWN_SOURCE_STATUS');
  if (sourceStatus === 'PAGAMENTO PARCIAL') reviewReasons.push('PARTIAL_PAYMENT_REQUIRES_REVIEW');
  if (sourceStatus === 'PAGAMENTO SUPERIOR') reviewReasons.push('OVERPAYMENT_REQUIRES_REVIEW');
  if (paidCents === null) reviewReasons.push('MISSING_PAID_AMOUNT');
  if ((sourceStatus === 'VENCIDO' || sourceStatus === 'EM ABERTO') && (paidCents !== 0 || paymentDate)) {
    reviewReasons.push('OPEN_STATUS_PAYMENT_CONFLICT');
  }
  if (sourceStatus === 'PAGA' && (!paymentDate || paidCents === null || paidCents <= 0)) {
    reviewReasons.push('PAID_STATUS_PAYMENT_CONFLICT');
  }
  // updated_invoice_amount is NOT a balance. Discounts and fees are configuration,
  // never summed to synthesize receipts, accounting lines, or a remaining debt.
  return {
    invoiceId, personId, sourceEnrollmentId, sourceClassId, studentDocument,
    unitId: query.unitId, dueDate, principalCents, paidCents, paymentDate, sourceStatus,
    groupId: optionalId(row.invoice_group_id), order: optionalInteger(row.order),
    groupTotal: optionalInteger(row.invoice_group_total),
    financialConfiguration: {
      fixedDiscountCents: configuredMoney(discounts.fixed_discount_amount),
      earlyDiscountCents: configuredMoney(early.early_payment_discount_amount),
      earlyDiscountPercentage: rate(early.early_payment_discount_percentage),
      fineRate: rate(fees.fine), interestRate: rate(fees.interest),
    },
    reviewReasons,
  };
}

export function parseV2Envelope(payload: unknown, page: number) {
  const root = object(Array.isArray(payload) && payload.length === 1 ? payload[0] : payload);
  const meta = object(root.meta);
  if (root.success === false || root.sucess === false || root.status === 'error' || root.error || !Array.isArray(root.data)) invalid();
  const fields = ['current_page', 'last_page', 'total', 'per_page'];
  for (const key of fields) {
    if (root[key] !== undefined && meta[key] !== undefined && root[key] !== meta[key]) invalid();
  }
  const currentPage = integer(root.current_page ?? meta.current_page, 1, 10000);
  const lastPage = integer(root.last_page ?? meta.last_page, currentPage, 10000);
  const total = integer(root.total ?? meta.total, 0, 200000);
  const rows = root.data as unknown[];
  if (currentPage !== page || rows.length > 100 || rows.length > total
    || (total === 0 && (lastPage !== 1 || rows.length !== 0))
    || (total > 0 && rows.length === 0)) invalid('Paginação Proesc V2 incompleta.');
  return { rows, currentPage, lastPage, total };
}

export function parseProescV2InvoicePage(payload: unknown, query: V2InvoiceQuery) {
  const envelope = parseV2Envelope(payload, query.page);
  const records = envelope.rows.map((row) => normalizeProescV2Invoice(row, query));
  if (new Set(records.map((row) => row.invoiceId)).size !== records.length) invalid('Identificadores repetidos na página Proesc V2.');
  return { records, currentPage: envelope.currentPage, lastPage: envelope.lastPage, total: envelope.total };
}

export async function readV2Json(url: URL, credentials: V2Credentials): Promise<unknown> {
  if (url.origin !== 'https://api.proesc.com' || !['/api/v2/invoices', '/api/v2/people'].includes(url.pathname)) invalid();
  const headers = v2Headers(credentials.token, credentials.wafHeader);
  let response: Response;
  const deadline = AbortSignal.timeout(25000);
  const signal = credentials.signal ? AbortSignal.any([credentials.signal, deadline]) : deadline;
  try {
    response = await (credentials.transport ?? fetch)(url, {
      method: 'GET', redirect: 'error', signal, headers,
    });
  } catch { throw new ProescError('Proesc V2 indisponível ou prazo excedido.', signal.aborted ? 504 : 502); }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ProescError('Proesc V2 não concluiu a consulta.', response.status === 429 ? 429 : 502);
  }
  const reader = response.body?.getReader();
  if (!reader) invalid();
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader!.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4_000_000) { await reader!.cancel(); invalid(); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { throw new ProescError('Resposta Proesc V2 inválida ou excessiva.', signal.aborted ? 504 : 502); }
  finally { reader!.releaseLock(); }
}

export async function readProescV2InvoicePage(options: V2Credentials & V2InvoiceQuery) {
  const unitId = v2Identifier(options.unitId);
  const period = `${options.year}-${String(options.month).padStart(2, '0')}`;
  const url = buildQueryUrl('invoices', { unitId, start: period, end: period }, options);
  if (options.personId !== undefined) url.searchParams.set('person_id', v2Identifier(options.personId));
  return parseProescV2InvoicePage(await readV2Json(url, options), options);
}

/** Returns only a complete bounded inventory. An absent invoice never means cancellation. */
export async function collectProescV2Invoices(options: V2Credentials & Omit<V2InvoiceQuery, 'page'> & { maxPages?: number }) {
  const maxPages = integer(options.maxPages ?? 1000, 1, 10000);
  const records: ProescV2Invoice[] = [];
  const seen = new Set<string>();
  let total: number | null = null;
  let lastPage: number | null = null;
  for (let page = 1; page <= maxPages; page++) {
    const result = await readProescV2InvoicePage({ ...options, page });
    if (total !== null && (total !== result.total || lastPage !== result.lastPage)) invalid('Inventário Proesc V2 mudou durante a consulta.');
    total = result.total;
    lastPage = result.lastPage;
    if (lastPage > maxPages) invalid('Consulta Proesc V2 excedeu o limite de páginas.');
    for (const record of result.records) {
      if (seen.has(record.invoiceId)) invalid('Parcela repetida entre páginas Proesc V2.');
      seen.add(record.invoiceId);
      records.push(record);
    }
    if (page === lastPage) {
      if (records.length !== total) invalid('Inventário Proesc V2 incompleto.');
      return { records, total, pages: page, complete: true as const };
    }
  }
  return invalid('Consulta Proesc V2 incompleta.');
}
