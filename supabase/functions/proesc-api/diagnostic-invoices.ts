import { object, ProescError } from './contract.ts';
import { readProescOperation } from './operations.ts';

type Admin = Parameters<typeof readProescOperation>[0];
const candidateLimit = 20;
const documentedStatuses = new Set(['VENCIDO', 'PAGA', 'EM ABERTO']);
const structuralFields = [
  'invoice_id', 'entidade_id', 'description', 'order', 'invoice_group_id',
  'invoice_group_type_id', 'invoice_group_type_name', 'invoice_group_total',
  'status', 'due_date', 'original_invoice_amount', 'updated_invoice_amount',
  'paid_invoice_amount', 'payment_date', 'discounts', 'bank_slip',
  'student_id', 'person_id', 'enrollment_id', 'matricula_id', 'aluno_id', 'pessoa_id',
] as const;

function parameters(body: unknown) {
  const input = object(body);
  const allUnits = input.allUnits === true;
  const validUnit = allUnits ? !Object.hasOwn(input, 'unitId')
    : input.allUnits === undefined && typeof input.unitId === 'string' && /^\d{1,16}$/.test(input.unitId);
  if (Object.keys(input).some((key) => !['action', 'unitId', 'allUnits', 'year', 'month', 'page'].includes(key))
    || (input.action !== undefined && input.action !== 'internal_invoice_probe')
    || !validUnit
    || typeof input.year !== 'number' || !Number.isInteger(input.year) || input.year < 2000 || input.year > 2099
    || typeof input.month !== 'number' || !Number.isInteger(input.month) || input.month < 1 || input.month > 12
    || (input.page !== undefined && input.page !== 1)) {
    throw new ProescError('Informe unidade ou todas as unidades explicitamente, ano e mês válidos para o diagnóstico.');
  }
  const period = `${input.year}-${String(input.month).padStart(2, '0')}`;
  return {
    filters: { unitId: allUnits ? '' : input.unitId as string, start: period, end: period },
    cursor: { year: input.year, month: input.month, page: 1 },
  };
}

function identifier(value: unknown): string | number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
  return typeof value === 'string' && /^[1-9]\d{0,17}$/.test(value) ? value : null;
}

function amount(value: unknown): string | number | null {
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) < 1e12 ? value : null;
  return typeof value === 'string' && /^-?\d{1,12}(?:[.,]\d{1,4})?$/.test(value) ? value : null;
}

function date(value: unknown): string | null {
  return typeof value === 'string'
    && (/^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{2}\/\d{2}\/\d{4}$/.test(value)) ? value : null;
}

function status(value: unknown): string | null {
  return typeof value === 'string' && documentedStatuses.has(value) ? value : null;
}

function candidate(value: unknown) {
  const row = object(value);
  const discounts = object(row.discounts);
  // Preserve the documented nesting and any root values independently. Neither
  // a status label nor invoice_id establishes correspondence with V1 chave_id.
  return {
    invoice_id: identifier(row.invoice_id), status: status(row.status),
    due_date: date(row.due_date), original_invoice_amount: amount(row.original_invoice_amount),
    paid_invoice_amount: amount(row.paid_invoice_amount), payment_date: date(row.payment_date),
    discounts: {
      paid_invoice_amount: amount(discounts.paid_invoice_amount),
      payment_date: date(discounts.payment_date),
    },
  };
}

function failure(error: unknown, httpStatus: number | null, transportFailed: boolean) {
  if (error instanceof ProescError && error.status === 409) {
    return new ProescError('A credencial Proesc V2 está indisponível ou mudou. O diagnóstico foi invalidado.', 409);
  }
  if (transportFailed || httpStatus === null) {
    return new ProescError('O Proesc V2 não respondeu ou excedeu o prazo do diagnóstico.', 502);
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return new ProescError(`O recurso de parcelas Proesc V2 recusou o acesso (HTTP ${httpStatus}).`, 502);
  }
  if (httpStatus === 429) {
    return new ProescError('O Proesc V2 limitou as consultas de parcelas (HTTP 429).', 429);
  }
  if (httpStatus >= 500) {
    return new ProescError(`O serviço de parcelas Proesc V2 falhou (HTTP ${httpStatus}).`, 502);
  }
  if (httpStatus >= 300) {
    return new ProescError(`O Proesc V2 não concluiu a consulta de parcelas (HTTP ${httpStatus}).`, 502);
  }
  return new ProescError('A resposta ou paginação de parcelas Proesc V2 é inválida ou incompleta.', 502);
}

/** Internal, bounded V2 inspection. It never records observations or mutations. */
export async function runProescInvoiceDiagnostic(
  admin: Admin, actorId: string, body: unknown, transport: typeof fetch = fetch,
) {
  const request = parameters(body);
  let httpStatus: number | null = null;
  let transportFailed = false;
  const observedTransport: typeof fetch = async (input, init) => {
    try {
      const response = await transport(input, init);
      httpStatus = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
        ? response.status : null;
      return response;
    } catch {
      transportFailed = true;
      throw new Error('INVOICE_TRANSPORT_UNAVAILABLE');
    }
  };
  try {
    const operation = await readProescOperation(admin, actorId, { operation: 'invoices', ...request }, observedTransport);
    const page = object(operation.result);
    if (!Array.isArray(page.records)) throw new ProescError('Resposta de diagnóstico inválida.', 502);
    const rows = page.records.map(object);
    const statusCounts: Record<string, number> = {};
    const fieldPresence: Record<string, number> = {};
    for (const row of rows) {
      const label = status(row.status) ?? (row.status === undefined || row.status === null ? 'MISSING' : 'UNRECOGNIZED');
      statusCounts[label] = (statusCounts[label] ?? 0) + 1;
      const available = Array.isArray(row.availableFields) ? row.availableFields : [];
      for (const field of structuralFields) {
        if (available.includes(field)) fieldPresence[field] = (fieldPresence[field] ?? 0) + 1;
      }
      for (const field of ['paid_invoice_amount', 'payment_date']) {
        if (Object.hasOwn(object(row.discounts), field)) {
          const path = `discounts.${field}`;
          fieldPresence[path] = (fieldPresence[path] ?? 0) + 1;
        }
      }
    }
    return {
      readOnly: true, version: 'v2', operation: 'invoices', identityMapping: 'NOT_ASSESSED',
      unitFilter: request.filters.unitId ? 'EXACT' : 'ALL_UNITS',
      period: page.period, currentPage: page.currentPage, lastPage: page.lastPage,
      hasMorePages: page.nextCursor !== null, rowCount: rows.length,
      candidateLimit, candidatesTruncated: rows.length > candidateLimit,
      statusCounts, fieldPresence, candidates: rows.slice(0, candidateLimit).map(candidate),
    };
  } catch (error) {
    // Even RPC/transport exceptions may contain secret-bearing headers or URLs.
    throw failure(error, httpStatus, transportFailed);
  }
}
