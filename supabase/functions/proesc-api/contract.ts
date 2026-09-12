export type RecordValue = Record<string, unknown>;
export type Resource = 'people' | 'invoices';
export type Cursor = { year: number; month: number; page: number };
export type Filters = { unitId: string; start: string; end: string };

export class ProescError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const object = (value: unknown): RecordValue =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};

const integer = (value: unknown, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ProescError('Parâmetro de consulta inválido.');
  }
  return parsed;
};

export function validateConsultation(input: RecordValue) {
  if (input.resource !== 'people' && input.resource !== 'invoices') {
    throw new ProescError('Consulta permitida somente para pessoas ou cobranças.');
  }
  const raw = object(input.filters);
  const unitId = String(raw.unitId || '').trim();
  if (unitId && !/^\d{1,16}$/.test(unitId)) throw new ProescError('Unidade Proesc inválida.');
  const month = (value: unknown) => {
    const text = String(value || '');
    if (!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(text)) throw new ProescError('Informe o período de vencimentos.');
    return text;
  };
  const start = month(raw.start);
  const end = month(raw.end);
  const [year, firstMonth] = start.split('-').map(Number);
  const [lastYear, lastMonth] = end.split('-').map(Number);
  const months = (lastYear - year) * 12 + lastMonth - firstMonth;
  if (months < 0 || months > 59) throw new ProescError('Escolha um período de até cinco anos.');
  return {
    resource: input.resource as Resource,
    filters: { unitId, start, end },
    cursor: { year, month: firstMonth, page: 1 },
  };
}

export function buildQueryUrl(resource: Resource, filters: Filters, cursor: Cursor) {
  if (!['invoices', 'people'].includes(resource)) throw new ProescError('Recurso inválido.');
  const url = new URL(`https://api.proesc.com/api/v2/${resource}`);
  url.searchParams.set('page', String(integer(cursor.page, 1, 10000)));
  if (filters.unitId) {
    if (!/^\d{1,16}$/.test(filters.unitId)) throw new ProescError('Unidade inválida.');
    url.searchParams.set('unit_id', filters.unitId);
  }
  if (resource === 'invoices') {
    url.searchParams.set('expiration_year', String(integer(cursor.year, 2000, 2099)));
    url.searchParams.set('expiration_month', String(integer(cursor.month, 1, 12)));
  }
  return url;
}

const scalar = (value: unknown) =>
  value === null || typeof value === 'boolean' || typeof value === 'number' ? value
    : typeof value === 'string' ? value.slice(0, 2000) : null;
const pick = (row: RecordValue, keys: string[]) => Object.fromEntries(
  keys.filter((key) => key in row).map((key) => [key, scalar(row[key])]),
);
const linkage = ['student_id', 'person_id', 'enrollment_id', 'matricula_id', 'aluno_id', 'pessoa_id'];
const invoiceKeys = ['invoice_id', 'entidade_id', 'description', 'order', 'invoice_group_id',
  'invoice_group_type_id', 'invoice_group_type_name', 'invoice_group_total', 'status',
  'due_date', 'original_invoice_amount', 'updated_invoice_amount', 'paid_invoice_amount',
  'payment_date', ...linkage];

export function normalizeRecord(resource: Resource, value: unknown): RecordValue {
  const row = object(value);
  if (resource === 'people') {
    return {
      ...pick(row, ['id', 'name', 'cpf_number', 'student_identification_number']),
      main_group: pick(object(row.main_group), ['id', 'name']),
      enrollments: Array.isArray(row.enrollments) ? row.enrollments.map((value) => {
        const enrollment = object(value);
        return { ...pick(enrollment, ['id', 'academic_year', 'grade_year', 'course', 'status', 'situation']),
          class: pick(object(enrollment.class), ['id', 'name']) };
      }) : [],
      availableFields: Object.keys(row).filter((key) => !/token|secret|password|authorization/i.test(key)),
    };
  }
  const discounts = object(row.discounts);
  const slip = object(row.bank_slip ?? discounts.bank_slip);
  return {
    ...pick(row, invoiceKeys),
    discounts: {
      ...pick(discounts, ['fixed_discount_amount', 'updated_invoice_amount', 'paid_invoice_amount', 'payment_date']),
      late_payment_fees: pick(object(discounts.late_payment_fees), ['fine', 'interest']),
    },
    bank_slip: pick(slip, ['external_gateway_id', 'barcode_line']),
    availableFields: Object.keys(row).filter((key) => !/token|secret|password|authorization/i.test(key)),
  };
}

export function parsePage(payload: unknown, resource: Resource, filters: Filters, cursor: Cursor) {
  // A documentação descreve tanto envelope quanto array contendo o envelope.
  const root = object(Array.isArray(payload) && payload.length === 1 ? payload[0] : payload);
  if (root.success === false || root.sucess === false || !Array.isArray(root.data)) {
    throw new ProescError('Formato Proesc não reconhecido. A consulta ficou pendente para conferência.', 502);
  }
  if (root.data.length > 2000) throw new ProescError('Página Proesc excedeu o limite de consulta.', 502);
  const currentPage = integer(root.current_page, 1, 10000);
  const lastPage = integer(root.last_page, 1, 10000);
  if (currentPage !== cursor.page || lastPage < currentPage) {
    throw new ProescError('Paginação Proesc inconsistente. Nenhuma conclusão foi presumida.', 502);
  }
  let nextCursor: Cursor | null = null;
  if (currentPage < lastPage) nextCursor = { ...cursor, page: currentPage + 1 };
  else if (resource === 'invoices') {
    const next = cursor.month === 12
      ? { year: cursor.year + 1, month: 1, page: 1 }
      : { year: cursor.year, month: cursor.month + 1, page: 1 };
    if (`${next.year}-${String(next.month).padStart(2, '0')}` <= filters.end) nextCursor = next;
  }
  return {
    currentPage, lastPage, nextCursor,
    records: root.data.map((row: unknown) => normalizeRecord(resource, row)),
    consultedAt: new Date().toISOString(),
    period: resource === 'invoices' ? `${cursor.year}-${String(cursor.month).padStart(2, '0')}` : null,
  };
}

export async function queryProesc(
  token: string, resource: Resource, filters: Filters, cursor: Cursor,
  transport: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await transport(buildQueryUrl(resource, filters, cursor), {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
  } catch {
    throw new ProescError('Proesc indisponível ou demorou para responder. Tente retomar a consulta.', 502);
  }
  if (!response.ok) {
    await response.body?.cancel();
    const message = response.status === 401 || response.status === 403
      ? 'O Proesc recusou o acesso. Confira o token, a validade e as permissões.'
      : response.status === 429 ? 'Limite do Proesc atingido. Aguarde e retome a consulta.'
      : 'O Proesc não concluiu a consulta. Tente novamente mais tarde.';
    throw new ProescError(message, response.status === 429 ? 429 : 502);
  }
  // Limite em bytes mesmo quando Content-Length estiver ausente.
  const reader = response.body?.getReader();
  if (!reader) throw new ProescError('Resposta Proesc vazia.', 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4_000_000) {
        await reader.cancel();
        throw new ProescError('Resposta Proesc excedeu o limite de consulta.', 502);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return parsePage(JSON.parse(new globalThis.TextDecoder().decode(bytes)), resource, filters, cursor);
  } catch (error) {
    if (error instanceof ProescError) throw error;
    throw new ProescError('Resposta Proesc inválida. Consulta pendente para conferência.', 502);
  } finally { reader.releaseLock(); }
}
