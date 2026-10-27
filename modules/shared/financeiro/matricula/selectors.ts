import type { EnrollmentFinancialProjection, FinancialOrigin } from './contract';

type CycleProjection = EnrollmentFinancialProjection & { podeGerar: boolean; proximoCicloNumero: number | null };
export const canChooseCycle = (state: CycleProjection, cycle: number | null) => !state.diagnosticoFinanceiro && (
  state.decisaoGestor ? state.decisaoGestor.opcoes.some((o) => o.cicloNumero === cycle && o.podeGerar)
    : state.podeGerar && cycle !== null && state.proximoCicloNumero === cycle
);
export const hasCycleChoice = (state: CycleProjection) => !state.diagnosticoFinanceiro && (
  state.decisaoGestor ? state.decisaoGestor.opcoes.some((o) => o.podeGerar) : state.podeGerar
);
export type FinancialOriginFilter = 'TODAS' | 'MISTAS' | FinancialOrigin;
export const matchesFinancialOrigin = (state: EnrollmentFinancialProjection, filter: FinancialOriginFilter) => {
  const origins = new Set(state.financeiroMatricula?.fontes.map((s) => s.origem) ?? []);
  return filter === 'TODAS' || (filter === 'MISTAS' ? origins.size > 1 : origins.has(filter));
};
