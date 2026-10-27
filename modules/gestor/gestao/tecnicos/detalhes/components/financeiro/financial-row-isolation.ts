import type { MatriculaTecnicaFinanceiroRow } from './matricula-tecnica-financeiro.types';
import { requireMatriculaTecnicaCicloManual } from './matricula-tecnica-ciclo-manual.parser';

export function isolateFinancialCycleRows(rows: MatriculaTecnicaFinanceiroRow[]): MatriculaTecnicaFinanceiroRow[] {
  return rows.map((row) => {
    try {
      const state = requireMatriculaTecnicaCicloManual(row.cicloManual);
      if ((state.financeiroMatricula && state.financeiroMatricula.matriculaId !== row.matriculaId)
        || (state.correcaoEmissao && state.correcaoEmissao.matriculaId !== row.matriculaId)) {
        throw new Error('A projeção financeira pertence a outra matrícula.');
      }
      return row;
    } catch (error) {
      return { ...row, cicloManual: {
        habilitado: false, modo: null, estado: 'NAO_HABILITADO', podeGerar: false,
        cicloBaseHistorico: null, cicloMaximo: null, proximoCicloNumero: null,
        primeiroVencimentoSugerido: null, criterioElegibilidade: null, politica: null,
        cicloGerado: null, bloqueio: null,
        diagnosticoFinanceiro: error instanceof Error ? error.message : 'Estado financeiro inválido.',
      } };
    }
  });
}
