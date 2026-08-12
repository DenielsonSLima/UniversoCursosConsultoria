const ACADEMIC_REPORT_SOURCES = new Set([
  'matriculas',
  'turmas',
  'parceiros',
  'cursos',
  'polos',
]);

const FINANCIAL_REPORT_SOURCES = new Set([
  'contas_receber',
  'contas_pagar',
  'despesas_lancamentos',
  'despesas_lancamentos_rateios',
  'transferencias_contas',
  'contas_bancarias',
  'contas_bancarias_polos',
  'emprestimos_financeiros',
  'emprestimo_parcelas',
  'emprestimo_parcela_rateios',
]);

export const isRelatoriosRealtimeSource = (source: unknown) =>
  ACADEMIC_REPORT_SOURCES.has(String(source || ''));

export const isRelatoriosFinanceiroRealtimeSource = (source: unknown) =>
  FINANCIAL_REPORT_SOURCES.has(String(source || ''));
