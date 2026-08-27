import { supabase } from '../../../../lib/supabase';
import type { ResumoMonthlyPeriod } from './resumo-period';

export interface ResumoFinanceiroValues {
  totalRecebido: number;
  totalAReceber: number;
  totalPago: number;
  totalAPagar: number;
  saldoCaixa: number;
}

export interface ResumoFluxoMensal {
  mes: string;
  ano: number;
  mesNome: string;
  creditos: number;
  debitos: number;
}

interface ResumoFinanceiroFilters {
  poloId?: string | null;
  start: string;
  end: string;
}

interface ResumoFluxoFilters {
  poloId?: string | null;
  periods: ResumoMonthlyPeriod[];
}

const normalizePoloId = (poloId?: string | null) => (
  poloId && poloId !== 'todos' ? poloId : null
);

const requiredNumber = (value: unknown, field: string) => {
  const normalized = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(normalized)) {
    throw new Error(`O backend retornou um valor financeiro inválido: ${field}.`);
  }
  return normalized;
};

const mapResumoFinanceiro = (row: Record<string, unknown>): ResumoFinanceiroValues => ({
  totalRecebido: requiredNumber(row.total_recebido, 'total_recebido'),
  totalAReceber: requiredNumber(row.total_a_receber, 'total_a_receber'),
  totalPago: requiredNumber(row.total_pago, 'total_pago'),
  totalAPagar: requiredNumber(row.total_a_pagar, 'total_a_pagar'),
  saldoCaixa: requiredNumber(row.saldo_caixa, 'saldo_caixa'),
});

const fetchResumoValues = async (
  filters: ResumoFinanceiroFilters,
): Promise<ResumoFinanceiroValues> => {
  const { data, error } = await supabase.rpc('get_financeiro_summary', {
    p_polo_id: normalizePoloId(filters.poloId),
    p_data_inicio: filters.start,
    p_data_fim: filters.end,
  });
  if (error) throw new Error('Não foi possível carregar os valores do resumo financeiro.');

  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row !== 'object') {
    throw new Error('O backend não retornou o resumo financeiro autorizado.');
  }
  return mapResumoFinanceiro(row as Record<string, unknown>);
};

export const resumoFinanceiroService = {
  async getValues(filters: ResumoFinanceiroFilters): Promise<ResumoFinanceiroValues> {
    return fetchResumoValues(filters);
  },

  async getThreeMonthFlow(filters: ResumoFluxoFilters): Promise<ResumoFluxoMensal[]> {
    const summaries = await Promise.all(filters.periods.map((period) => fetchResumoValues({
      poloId: filters.poloId,
      start: period.start,
      end: period.end,
    })));

    return filters.periods.map((period, index) => ({
      mes: period.mes,
      ano: period.ano,
      mesNome: period.mesNome,
      creditos: summaries[index].totalRecebido,
      debitos: summaries[index].totalPago,
    }));
  },
};
