import { object, ProescError } from './contract.ts';
import { createProescV1Client, ProescV1ReadError, type ProescV1AccountingQuery } from './v1-client.ts';
import { proescV1Identifier, type ProescV1AccountingRow } from './v1-accounting.ts';

type Admin = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

function periodsFromBody(body: unknown): ProescV1AccountingQuery[] {
  const input = object(body);
  if (input.includeStatement !== undefined && typeof input.includeStatement !== 'boolean') {
    throw new ProescError('Opção de extrato inválida para o diagnóstico.');
  }
  if (input.includeIdentities !== undefined && typeof input.includeIdentities !== 'boolean') {
    throw new ProescError('Opção de identidade inválida para o diagnóstico.');
  }
  if (input.includeIdentities === true && (!Array.isArray(input.periods) || input.periods.length === 0)) {
    throw new ProescError('Informe a chave de cada título para consultar os nomes.');
  }
  if (input.periods === undefined) return [];
  if (!Array.isArray(input.periods) || input.periods.length > 4) {
    throw new ProescError('Informe até quatro consultas contábeis para o diagnóstico.');
  }
  return input.periods.map((value) => {
    const period = object(value);
    try {
      if (Object.keys(period).some((key) => !['unitId', 'year', 'month', 'externalKey'].includes(key))
        || typeof period.year !== 'number' || !Number.isInteger(period.year)
        || period.year < 1900 || period.year > 2200
        || typeof period.month !== 'number' || !Number.isInteger(period.month)
        || period.month < 1 || period.month > 12
        || (input.includeIdentities === true && period.externalKey === undefined)) throw new Error();
      return {
        unitId: proescV1Identifier(period.unitId),
        year: period.year,
        month: period.month,
        ...(period.externalKey === undefined ? {} : { externalKey: proescV1Identifier(period.externalKey) }),
      };
    } catch { throw new ProescError('Parâmetros inválidos no diagnóstico contábil.'); }
  });
}

type StatementSummary = {
  httpStatus: number;
  result: string;
  contentType?: string;
  logicalStatus?: string;
  topLevelType?: string;
  topLevelKeys?: string[];
  firstRowKeys?: string[];
  rowCount?: number;
  paymentDatePresentCount?: number;
  paymentDateMissingCount?: number;
};

async function statementSummary(token: string, unitId: string, year: number, transport: typeof fetch): Promise<StatementSummary> {
  const url = new URL('https://app.proesc.com/api/v1/financial_statement');
  url.search = new URLSearchParams({ token, unidade_id: unitId, ano_letivo: String(year) }).toString();
  let response: Response;
  try {
    response = await transport(url, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/json' },
    });
  } catch { return { httpStatus: 0, result: 'TRANSPORT_ERROR' }; }
  const contentType = /application\/(?:[a-z0-9.+-]+\+)?json/i.test(response.headers.get('content-type') ?? '')
    ? 'application/json' : /text\/html/i.test(response.headers.get('content-type') ?? '') ? 'text/html' : 'other';
  const base = { httpStatus: response.status, contentType };
  if (response.status !== 200 || contentType !== 'application/json') {
    await response.body?.cancel();
    return { ...base, result: response.status >= 300 && response.status < 400 ? 'REDIRECT_BLOCKED' : 'UNAVAILABLE' };
  }
  const reader = response.body?.getReader();
  if (!reader) return { ...base, result: 'EMPTY_RESPONSE' };
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 4_000_000) { await reader.cancel(); return { ...base, result: 'RESPONSE_LIMIT' }; }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const payload: unknown = JSON.parse(new globalThis.TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const root = object(Array.isArray(payload) && payload.length === 1
      && Array.isArray(object(payload[0]).data) ? payload[0] : payload);
    const safeKeys = (value: unknown) => Object.keys(object(value)).filter((key) =>
      /^[a-z_][a-z0-9_]{0,63}$/i.test(key) && !/token|secret|password|authorization/i.test(key)
      && !key.includes(token));
    const arrays = Object.values(root).filter(Array.isArray);
    const rows: unknown[] = Array.isArray(root.data) ? root.data : Array.isArray(payload) ? payload
      : arrays.length === 1 ? arrays[0] : [];
    const dates = rows.map((row) => {
      const value = object(row);
      return value.installment_payment_date ?? value.data_pagamento ?? value.payment_date;
    });
    return { ...base, result: 'JSON_OBSERVED',
      logicalStatus: root.status === 'success' || root.status === 'error' ? root.status : 'UNRECOGNIZED',
      topLevelType: Array.isArray(payload) ? 'array' : 'object',
      topLevelKeys: safeKeys(payload), firstRowKeys: safeKeys(rows[0]), rowCount: rows.length,
      paymentDatePresentCount: dates.filter((value) => typeof value === 'string'
        && value !== '' && value !== '0000-00-00' && value !== '00/00/0000').length,
      paymentDateMissingCount: dates.filter((value) => value === undefined || value === null
        || value === '' || value === '0000-00-00' || value === '00/00/0000').length,
    };
  } catch { return { ...base, result: 'INVALID_RESPONSE' }; }
  finally { void reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

function summarize(rows: ProescV1AccountingRow[], query: ProescV1AccountingQuery, index: number) {
  const blockCounts: Record<string, number> = {};
  const sums: Record<string, bigint> = {};
  const paymentDateCounts: Record<string, number> = {};
  const identities = new Set<string>();
  let missingPaymentDateCount = 0;
  let cancelledCount = 0;
  let renegotiationCount = 0;
  let unconfirmedFlagsCount = 0;
  let missingClassPrincipalCount = 0;
  let missingClassAndDocumentPrincipalCount = 0;
  const missingClassPrincipalCourseCounts: Record<string, number> = {};
  for (const row of rows) {
    blockCounts[row.blockId] = (blockCounts[row.blockId] ?? 0) + 1;
    sums[row.blockId] = (sums[row.blockId] ?? 0n) + BigInt(row.amountCents);
    if (row.paymentDate) paymentDateCounts[row.paymentDate] = (paymentDateCounts[row.paymentDate] ?? 0) + 1;
    else missingPaymentDateCount++;
    if (row.cancelled === true) cancelledCount++;
    if (row.renegotiationPayment === true) renegotiationCount++;
    if (row.cancelled === null || row.renegotiationPayment === null) unconfirmedFlagsCount++;
    if (row.blockId === '1' && !row.identity.classId && row.cancelled !== true) {
      missingClassPrincipalCount++;
      if (!row.identity.studentDocument) missingClassAndDocumentPrincipalCount++;
      const course = row.identity.courseId ?? 'UNIDENTIFIED';
      missingClassPrincipalCourseCounts[course] = (missingClassPrincipalCourseCounts[course] ?? 0) + 1;
    }
    identities.add(JSON.stringify(row.identity));
  }
  return {
    index,
    rowCount: rows.length,
    blockCounts,
    blockAmountCents: Object.fromEntries(Object.entries(sums).map(([block, cents]) => [block, cents.toString()])),
    paymentDateCounts,
    missingPaymentDateCount,
    cancelledCount,
    renegotiationCount,
    unconfirmedFlagsCount,
    missingClassPrincipalCount,
    missingClassAndDocumentPrincipalCount,
    missingClassPrincipalCourseCounts,
    // Compara somente as linhas entre si; não afirma vínculo com uma pessoa local.
    identityCoherent: rows.length > 0 && identities.size === 1
      && rows.every((row) => row.identity.classId !== null && row.identity.studentDocument !== null),
    queryKeysMatch: rows.every((row) => row.identity.unitId === query.unitId
      && (query.externalKey === undefined || row.externalKey === query.externalKey)),
  };
}

/** Leitura interna; identidade exige opção explícita e chave. Não grava dados. */
export async function runProescReadOnlyDiagnostic(
  admin: Admin,
  actorId: string,
  body: unknown,
  transport: typeof fetch = fetch,
) {
  const periods = periodsFromBody(body);
  const credential = async () => {
    const result = await admin.rpc('proesc_workspace_service', {
      p_action: 'token', p_actor_id: actorId, p_payload: {},
    });
    const saved = object(result.data);
    if (result.error || typeof saved.token !== 'string' || !/^[0-9a-f]{32}$/i.test(saved.token)
      || typeof saved.revision !== 'string' || !saved.revision) {
      throw new ProescError('Credencial Proesc V1 indisponível para o diagnóstico.', 409);
    }
    return { token: saved.token, revision: saved.revision };
  };
  try {
    const saved = await credential();
    const client = createProescV1Client({ token: saved.token, transport });
    const config = await client.configurationData();
    if (config.units.length !== 1 || periods.some((period) => period.unitId !== config.units[0].id)) {
      throw new ProescError('A unidade da consulta não corresponde à unidade Proesc configurada.', 409);
    }
    const summaries = [];
    for (const [index, query] of periods.entries()) {
      if (object(body).includeIdentities === true) {
        const result = await client.accountingIdentityData({ ...query, externalKey: query.externalKey! });
        summaries.push({ ...summarize(result.rows, query, index), identities: result.identities });
      } else {
        const result = await client.accountingData(query);
        summaries.push(summarize(result.rows, query, index));
      }
    }
    const statement = object(body).includeStatement === true
      ? await statementSummary(saved.token, config.units[0].id, periods[0]?.year ?? new Date().getUTCFullYear(), transport)
      : undefined;
    const current = await credential();
    if (current.revision !== saved.revision || current.token !== saved.token) {
      throw new ProescError('A credencial mudou durante o diagnóstico. Consulte novamente.', 409);
    }
    const categories = config.categories.filter((category) => ['1', '2', '3', '4', '6', '7', '10482'].includes(category.id));
    if (categories.some((category) => category.name.includes(saved.token) || /https?:\/\//i.test(category.name))) {
      throw new ProescError('A resposta de categorias não pôde ser apresentada com segurança.', 502);
    }
    return {
      readOnly: true,
      categories,
      summaries,
      ...(statement ? { statement } : {}),
    };
  } catch (error) {
    if (error instanceof ProescError) throw error;
    if (error instanceof ProescV1ReadError) throw new ProescError(error.message, 502);
    // RPCs e transportes podem incluir o segredo em message/cause: não propagar.
    throw new ProescError('Não foi possível concluir o diagnóstico Proesc.', 502);
  }
}
