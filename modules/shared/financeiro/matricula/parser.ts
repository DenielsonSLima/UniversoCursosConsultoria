import { FINANCIAL_ORIGINS, type EnrollmentFinancialContext, type ManagerCycleDecision, type FinancialRowDiagnostic } from './contract';

const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => Number.isInteger(v) && Number(v) >= 0;
const nullableString = (v: unknown) => v === null || typeof v === 'string';
const cycle = (v: unknown) => v === 1 || v === 2;

export function isolateFinancialWorkspaceRows<T>(rows: unknown[], parse: (value: unknown) => T) {
  const valid: T[] = [];
  const diagnostics: FinancialRowDiagnostic[] = [];
  for (const row of rows) {
    try { valid.push(parse(row)); } catch (error) {
      diagnostics.push({ matriculaId: record(row) && typeof row.matriculaId === 'string' ? row.matriculaId : null,
        mensagem: error instanceof Error ? error.message : 'Dados financeiros incompletos.' });
    }
  }
  return { valid, diagnostics };
}

export function requireEnrollmentFinancialContext(value: unknown): EnrollmentFinancialContext {
  if (!record(value) || value.versao !== 1 || typeof value.matriculaId !== 'string'
    || !record(value.mensalidades) || !integer(value.taxas) || !integer(value.ajustesResiduais)
    || !['lancadas', 'emitidas', 'bancariasEmitidas', 'externasConhecidas', 'canceladas', 'pagas', 'emRevisao']
      .every((key) => integer(value.mensalidades[key]))
    || Number(value.mensalidades.emitidas) !== Number(value.mensalidades.bancariasEmitidas) + Number(value.mensalidades.externasConhecidas)
    || Number(value.mensalidades.emitidas) > Number(value.mensalidades.lancadas)
    || !Array.isArray(value.fontes) || !value.fontes.every((s) => record(s)
      && FINANCIAL_ORIGINS.includes(s.origem as typeof FINANCIAL_ORIGINS[number])
      && nullableString(s.provedor) && nullableString(s.canal) && integer(s.quantidade))
    || !Array.isArray(value.ciclosComprovados) || !value.ciclosComprovados.every((c) => record(c)
      && cycle(c.numero) && typeof c.origem === 'string' && typeof c.confirmadoEm === 'string'
      && typeof c.identidadeConfirmada === 'boolean' && typeof c.emRevisao === 'boolean')
    || !Array.isArray(value.operacoes) || !value.operacoes.every((o) => record(o)
      && cycle(o.cicloNumero) && typeof o.estado === 'string' && nullableString(o.requestId) && integer(o.quantidadeItens))) {
    throw new Error('O servidor retornou uma proveniência financeira incompleta.');
  }
  return value as unknown as EnrollmentFinancialContext;
}

export function requireManagerCycleDecision(value: unknown): ManagerCycleDecision {
  if (!record(value) || value.versao !== 1 || value.naoEmitirPermitido !== true
    || !Array.isArray(value.opcoes) || value.opcoes.length !== 2
    || new Set(value.opcoes.map((o) => record(o) ? o.cicloNumero : null)).size !== 2
    || !value.opcoes.every((o) => record(o) && cycle(o.cicloNumero)
      && ['CRIAR', 'RETOMAR', 'CONSULTAR'].includes(String(o.acao))
      && typeof o.podeGerar === 'boolean' && nullableString(o.motivo)
      && (!o.podeGerar || (o.acao === 'CRIAR' && o.motivo === null)))) {
    throw new Error('O servidor não retornou as opções canônicas de ciclo.');
  }
  return value as unknown as ManagerCycleDecision;
}
