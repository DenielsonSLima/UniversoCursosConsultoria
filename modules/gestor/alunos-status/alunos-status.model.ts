export type AlunosStatusConsumer = 'PARCEIROS' | 'FINANCEIRO';

export interface AlunosStatusKpis {
  totalParceiros: number | null;
  totalParceirosAtivos: number | null;
  cadastrosAlunosTotal: number | null;
  cadastrosAlunosAtivos: number | null;
  cadastrosAlunosInativos: number | null;
  totalProfessores: number | null;
  totalProfessoresAtivos: number | null;
  totalProfessoresInativos: number | null;
  matriculasAtivas: number | null;
  alunosComMatriculaAtiva: number | null;
  parcelasEmAtraso: number | null;
}

const numberOrNull = (value: unknown, field: string) => {
  if (value === null || value === undefined) return null;
  const normalized = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/.test(value.trim())
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`Indicador inválido retornado pelo backend: ${field}.`);
  }
  return normalized;
};

export const normalizeAlunosStatusKpis = (
  row: Record<string, unknown>,
): AlunosStatusKpis => ({
  totalParceiros: numberOrNull(row.total_parceiros, 'total_parceiros'),
  totalParceirosAtivos: numberOrNull(row.total_parceiros_ativos, 'total_parceiros_ativos'),
  cadastrosAlunosTotal: numberOrNull(row.cadastros_alunos_total, 'cadastros_alunos_total'),
  cadastrosAlunosAtivos: numberOrNull(row.cadastros_alunos_ativos, 'cadastros_alunos_ativos'),
  cadastrosAlunosInativos: numberOrNull(row.cadastros_alunos_inativos, 'cadastros_alunos_inativos'),
  totalProfessores: numberOrNull(row.total_professores, 'total_professores'),
  totalProfessoresAtivos: numberOrNull(row.total_professores_ativos, 'total_professores_ativos'),
  totalProfessoresInativos: numberOrNull(row.total_professores_inativos, 'total_professores_inativos'),
  matriculasAtivas: numberOrNull(row.matriculas_ativas, 'matriculas_ativas'),
  alunosComMatriculaAtiva: numberOrNull(
    row.alunos_com_matricula_ativa,
    'alunos_com_matricula_ativa',
  ),
  parcelasEmAtraso: numberOrNull(row.parcelas_em_atraso, 'parcelas_em_atraso'),
});

export const assertAlunosStatusAccess = (
  metrics: AlunosStatusKpis,
  consumer: AlunosStatusConsumer,
) => {
  const fields: Array<keyof AlunosStatusKpis> = consumer === 'PARCEIROS'
    ? [
      'totalParceiros',
      'totalParceirosAtivos',
      'cadastrosAlunosTotal',
      'cadastrosAlunosAtivos',
      'cadastrosAlunosInativos',
      'totalProfessores',
      'totalProfessoresAtivos',
      'totalProfessoresInativos',
    ]
    : ['matriculasAtivas', 'alunosComMatriculaAtiva', 'parcelasEmAtraso'];
  const missing = fields.filter((field) => metrics[field] === null);
  if (missing.length) {
    throw new Error(`Indicadores não autorizados ou ausentes: ${missing.join(', ')}.`);
  }
};
