import type { ProescV1AccountingPage } from './v1-accounting.ts';

type DocumentState = 'AUSENTE' | 'INVALIDO' | 'VALIDO';

export interface ProescAccountingIdentityDiagnostic {
  chave: string;
  aluno_nome: string | null;
  responsavel_nome: string | null;
  tipo_nome: 'ALUNO' | 'RESPONSAVEL' | 'AUSENTE';
  bloco: string;
  vencimento: string;
  valor: string;
  estado_cpf: DocumentState;
  estado_cpf_responsavel: DocumentState;
}

// Estado de presença/formato reconhecido, sem corrigir zeros nem afirmar
// validade cadastral ou matemática dos dígitos verificadores.
function documentState(value: unknown): DocumentState {
  if (value === undefined || value === null || value === '') return 'AUSENTE';
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return 'INVALIDO';
    value = String(value);
  }
  if (typeof value !== 'string') return 'INVALIDO';
  return /^\d{11}$/.test(value) || /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value)
    ? 'VALIDO' : 'INVALIDO';
}

function safeName(value: unknown, token: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 300
    || value.includes(token) || /https?:\/\//i.test(value)
    || /\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2}/.test(value)
    // eslint-disable-next-line no-control-regex -- Não expor controles em campos externos.
    || /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error('Identidade diagnóstica inválida.');
  }
  return value.trim() || null;
}

/** Apenas a chave já conferida pelo cliente; nunca retorna documento cru. */
export function accountingIdentityDiagnostic(
  payload: Record<string, unknown>,
  page: ProescV1AccountingPage,
  externalKey: string,
  token: string,
): ProescAccountingIdentityDiagnostic[] {
  if (!Array.isArray(payload.data) || payload.data.length !== page.rows.length) {
    throw new Error('Identidade diagnóstica inválida.');
  }
  const entries: unknown[] = payload.data;
  return page.rows.map((row, index) => {
    const value = entries[index];
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || row.externalKey !== externalKey) throw new Error('Identidade diagnóstica inválida.');
    const raw = value as Record<string, unknown>;
    const student = safeName(raw.aluno_nome, token);
    const responsible = safeName(raw.responsavel_nome, token);
    const cents = BigInt(row.amountCents);
    const absolute = cents < 0n ? -cents : cents;
    return {
      chave: row.externalKey,
      aluno_nome: student,
      responsavel_nome: responsible,
      tipo_nome: student ? 'ALUNO' : responsible ? 'RESPONSAVEL' : 'AUSENTE',
      bloco: row.blockId,
      vencimento: row.dueDate,
      valor: `${cents < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`,
      estado_cpf: documentState(raw.aluno_cpf),
      estado_cpf_responsavel: documentState(raw.responsavel_cpf),
    };
  });
}
