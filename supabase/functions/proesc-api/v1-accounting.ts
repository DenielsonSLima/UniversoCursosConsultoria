export interface ProescV1AccountingSource {
  unitId: string;
  year: number;
  month: number;
}

export type ProescV1AccountingIssue =
  | 'MISSING_STUDENT_DOCUMENT'
  | 'MISSING_CLASS_ID'
  | 'UNCONFIRMED_FLAGS'
  | 'REPEATED_BLOCK'
  | 'CONFLICTING_IDENTITY'
  | 'CONFLICTING_DUE_DATE'
  | 'CANCELLED_RECORD'
  | 'RENEGOTIATION_RECORD';

export interface ProescV1AccountingRow {
  externalKey: string;
  blockId: string;
  amountCents: number;
  identity: {
    unitId: string;
    classId: string | null;
    courseId: string | null;
    studentDocument: string | null;
  };
  dueDate: string;
  paymentDate: string | null;
  createdDate: string | null;
  paymentMethod: string | null;
  cancelled: boolean | null;
  renegotiationPayment: boolean | null;
  competenceYear: number | null;
  competenceMonth: number | null;
  source: ProescV1AccountingSource & { rowIndex: number };
  issues: ProescV1AccountingIssue[];
}

export interface ProescV1AccountingPage {
  source: ProescV1AccountingSource;
  rows: ProescV1AccountingRow[];
}

export interface ProescV1AccountingGroup {
  unitId: string;
  externalKey: string;
  rows: ProescV1AccountingRow[];
  blockCounts: Record<string, number>;
  issues: ProescV1AccountingIssue[];
}

export const PROESC_V1_MAX_ROWS = 20_000;

const record = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const invalid = (): never => { throw new Error('Resposta contábil Proesc V1 inválida ou incompleta.'); };

export function proescV1Identifier(value: unknown): string {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) invalid();
  if (typeof value !== 'number' && typeof value !== 'string') invalid();
  const id = String(value);
  if (!/^[0-9]{1,80}$/.test(id) || !/[1-9]/.test(id)) invalid();
  return id;
}

const optionalIdentifier = (value: unknown): string | null => (
  value === undefined || value === null || value === '' ? null : proescV1Identifier(value)
);

export function proescV1MoneyCents(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') invalid();
  const text = String(value);
  if (text.length > 30 || !/^-?[0-9]+(?:\.[0-9]{1,2})?$/.test(text)) invalid();
  const negative = text.startsWith('-');
  const [whole, decimals = ''] = (negative ? text.slice(1) : text).split('.');
  const cents = (BigInt(whole) * 100n + BigInt(decimals.padEnd(2, '0'))) * (negative ? -1n : 1n);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) invalid();
  return Number(cents);
}

function date(value: unknown, optional = false): string | null {
  if (optional && (value === undefined || value === null || value === ''
    || value === '0000-00-00' || value === '00/00/0000')) return null;
  if (typeof value !== 'string') invalid();
  const text = value as string;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text
    : /^\d{2}\/\d{2}\/\d{4}$/.test(text) ? text.split('/').reverse().join('-') : '';
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (!iso || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) invalid();
  return iso;
}

function document(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    value = String(value);
  }
  if (typeof value !== 'string') return null;
  if (/^\d{11}$/.test(value)) return value;
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value)) return value.replace(/[.-]/g, '');
  // Um CPF numérico curto perdeu informação: não completar zeros por suposição.
  return null;
}

const optionalFlag = (value: unknown): boolean | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') invalid();
  return value as boolean;
};

const optionalInteger = (value: unknown, min: number, max: number): number | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value)) invalid();
  if (typeof value !== 'number' && typeof value !== 'string') invalid();
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) invalid();
  return number;
};

const paymentMethod = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value !== 'string' || value.length > 120 || /[\x00-\x1f\x7f]/.test(value)) invalid();
  return value as string;
};

export function parseProescV1Accounting(
  payload: unknown,
  source: ProescV1AccountingSource,
  maxRows = PROESC_V1_MAX_ROWS,
): ProescV1AccountingPage {
  const unitId = proescV1Identifier(source.unitId);
  if (!Number.isInteger(source.year) || source.year < 1900 || source.year > 2200
    || !Number.isInteger(source.month) || source.month < 1 || source.month > 12
    || !Number.isInteger(maxRows) || maxRows < 1 || maxRows > PROESC_V1_MAX_ROWS) invalid();
  if (!record(payload) || payload.status !== 'success' || !Array.isArray(payload.data)
    || payload.data.length > maxRows) invalid();
  const entries = (payload as { data: unknown[] }).data;
  const rows = entries.map((raw: unknown, rowIndex: number): ProescV1AccountingRow => {
    if (!record(raw)) invalid();
    const item = raw as Record<string, unknown>;
    const rowUnit = proescV1Identifier(item.unidade_id);
    if (rowUnit !== unitId) invalid();
    const identity = {
      unitId: rowUnit,
      classId: optionalIdentifier(item.turma_id),
      courseId: optionalIdentifier(item.curso),
      studentDocument: document(item.aluno_cpf),
    };
    const cancelled = optionalFlag(item.registro_cancelado);
    const renegotiationPayment = optionalFlag(item.pagamento_renegociacao);
    const issues: ProescV1AccountingIssue[] = [];
    if (!identity.studentDocument) issues.push('MISSING_STUDENT_DOCUMENT');
    if (!identity.classId) issues.push('MISSING_CLASS_ID');
    if (cancelled === null || renegotiationPayment === null) issues.push('UNCONFIRMED_FLAGS');
    if (cancelled) issues.push('CANCELLED_RECORD');
    if (renegotiationPayment) issues.push('RENEGOTIATION_RECORD');
    return {
      externalKey: proescV1Identifier(item.chave_id),
      blockId: proescV1Identifier(item.id),
      amountCents: proescV1MoneyCents(item.valor),
      identity,
      dueDate: date(item.data_vencimento)!,
      paymentDate: date(item.data_pagamento, true),
      createdDate: date(item.data_cricao, true),
      paymentMethod: paymentMethod(item.forma_pagamento),
      cancelled,
      renegotiationPayment,
      competenceYear: optionalInteger(item.competencia_ano, 1900, 2200),
      competenceMonth: optionalInteger(item.competencia_mes, 1, 12),
      source: { unitId, year: source.year, month: source.month, rowIndex },
      issues,
    };
  });
  // O período da consulta não é um filtro local de vencimento: pagamentos
  // retornados pelo Proesc podem pertencer a obrigações de outro mês.
  return { source: { unitId, year: source.year, month: source.month }, rows };
}

export function groupProescV1Accounting(rows: ProescV1AccountingRow[]): ProescV1AccountingGroup[] {
  const groups = new Map<string, ProescV1AccountingGroup>();
  for (const row of rows) {
    const key = JSON.stringify([row.identity.unitId, row.externalKey]);
    let group = groups.get(key);
    if (!group) {
      group = { unitId: row.identity.unitId, externalKey: row.externalKey, rows: [], blockCounts: {}, issues: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
    group.blockCounts[row.blockId] = (group.blockCounts[row.blockId] || 0) + 1;
  }
  for (const group of groups.values()) {
    const issues = new Set(group.rows.flatMap((row) => row.issues));
    if (Object.values(group.blockCounts).some((count) => count > 1)) issues.add('REPEATED_BLOCK');
    if (new Set(group.rows.map((row) => JSON.stringify(row.identity))).size > 1) issues.add('CONFLICTING_IDENTITY');
    if (new Set(group.rows.map((row) => row.dueDate)).size > 1) issues.add('CONFLICTING_DUE_DATE');
    group.issues = [...issues];
  }
  // Agrupamento de observações, não identidade comprovada da parcela nem baixa.
  // As legendas de blocos publicadas e observadas divergem; não classificar
  // recebimento, desconto, juros ou multa automaticamente apenas pelo id.
  return [...groups.values()];
}
