import { queryOptions } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';

export type CaixaLinhaCorteStatusOperacional =
  | 'LUCRO'
  | 'COBRINDO_FIXAS'
  | 'ABAIXO_DA_LINHA'
  | 'SEM_MOVIMENTO';

export type CaixaLinhaCorteImpactoInadimplencia =
  | 'SEGURO'
  | 'RECUPERAVEL'
  | 'CRITICO';

export interface CaixaLinhaCorteReceitas {
  realizadas: number;
  previstas: number;
  totais: number;
}

export interface CaixaLinhaCorteInadimplencia {
  valorVencido: number;
  quantidadeTitulos: number;
  taxaInadimplenciaMes: number;
  toleranciaInadimplencia: number;
  impacto: CaixaLinhaCorteImpactoInadimplencia;
  diagnostico: string;
}

export interface CaixaLinhaCorteDespesas {
  fixas: number;
  variaveis: number;
  rateadas: number;
  variaveisERateios: number;
  linhaCorteTotal: number;
  percentualFixas: number;
  percentualVariaveisRateios: number;
}

export interface CaixaLinhaCorteCobertura {
  statusOperacional: CaixaLinhaCorteStatusOperacional;
  pontoEquilibrioAtingido: boolean;
  coberturaFixaAtingida: boolean;
  percentualRealizado: number;
  percentualProjetado: number;
  margemAtual: number;
  margemProjetada: number;
  valorFaltante: number;
}

export interface CaixaLinhaCorteHistoricoItem {
  rotulo: string | null;
  linhaCorte: number;
  receitas: number;
  variacaoPercentual: number | null;
}

export interface CaixaLinhaCorteHistorico {
  mesesAmostra: number;
  rotuloAmostra: string;
  mesAnterior: CaixaLinhaCorteHistoricoItem;
  mediaTrimestral: {
    linhaCorte: number;
    receitas: number;
    variacaoPercentual: number | null;
  };
}

export interface CaixaLinhaCorteResumo {
  competencia: string;
  poloId: string | null;
  receitas: CaixaLinhaCorteReceitas;
  inadimplencia: CaixaLinhaCorteInadimplencia;
  despesas: CaixaLinhaCorteDespesas;
  cobertura: CaixaLinhaCorteCobertura;
  historico: CaixaLinhaCorteHistorico;
}

const asNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const asNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const asString = (value: unknown, fallback = ''): string => {
  return typeof value === 'string' ? value : fallback;
};

const asBoolean = (value: unknown, fallback = false): boolean => {
  return typeof value === 'boolean' ? value : fallback;
};

export const mapCaixaLinhaCorte = (value: unknown): CaixaLinhaCorteResumo => {
  const root = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const receitas = (root.receitas && typeof root.receitas === 'object' ? root.receitas : {}) as Record<string, unknown>;
  const inadimplencia = (root.inadimplencia && typeof root.inadimplencia === 'object'
    ? root.inadimplencia
    : {}) as Record<string, unknown>;
  const despesas = (root.despesas && typeof root.despesas === 'object' ? root.despesas : {}) as Record<string, unknown>;
  const cobertura = (root.cobertura && typeof root.cobertura === 'object' ? root.cobertura : {}) as Record<string, unknown>;
  const historico = (root.historico && typeof root.historico === 'object' ? root.historico : {}) as Record<string, unknown>;
  const mesAnterior = (historico.mes_anterior && typeof historico.mes_anterior === 'object'
    ? historico.mes_anterior
    : {}) as Record<string, unknown>;
  const mediaTrimestral = (historico.media_trimestral && typeof historico.media_trimestral === 'object'
    ? historico.media_trimestral
    : {}) as Record<string, unknown>;

  const statusRaw = asString(cobertura.status_operacional, 'SEM_MOVIMENTO');
  const validStatus: CaixaLinhaCorteStatusOperacional = (
    statusRaw === 'LUCRO' ||
    statusRaw === 'COBRINDO_FIXAS' ||
    statusRaw === 'ABAIXO_DA_LINHA'
  ) ? statusRaw : 'SEM_MOVIMENTO';

  const impactoRaw = asString(inadimplencia.impacto, 'SEGURO');
  const validImpacto: CaixaLinhaCorteImpactoInadimplencia = (
    impactoRaw === 'RECUPERAVEL' ||
    impactoRaw === 'CRITICO'
  ) ? impactoRaw : 'SEGURO';

  return {
    competencia: asString(root.competencia, new Date().toISOString().slice(0, 10)),
    poloId: typeof root.polo_id === 'string' ? root.polo_id : null,
    receitas: {
      realizadas: asNumber(receitas.realizadas),
      previstas: asNumber(receitas.previstas),
      totais: asNumber(receitas.totais),
    },
    inadimplencia: {
      valorVencido: asNumber(inadimplencia.valor_vencido),
      quantidadeTitulos: asNumber(inadimplencia.quantidade_titulos),
      taxaInadimplenciaMes: asNumber(inadimplencia.taxa_inadimplencia_mes),
      toleranciaInadimplencia: asNumber(inadimplencia.tolerancia_inadimplencia),
      impacto: validImpacto,
      diagnostico: asString(inadimplencia.diagnostico),
    },
    despesas: {
      fixas: asNumber(despesas.fixas),
      variaveis: asNumber(despesas.variaveis),
      rateadas: asNumber(despesas.rateadas),
      variaveisERateios: asNumber(despesas.variaveis_e_rateios),
      linhaCorteTotal: asNumber(despesas.linha_corte_total),
      percentualFixas: asNumber(despesas.percentual_fixas),
      percentualVariaveisRateios: asNumber(despesas.percentual_variaveis_rateios),
    },
    cobertura: {
      statusOperacional: validStatus,
      pontoEquilibrioAtingido: asBoolean(cobertura.ponto_equilibrio_atingido),
      coberturaFixaAtingida: asBoolean(cobertura.cobertura_fixa_atingida),
      percentualRealizado: asNumber(cobertura.percentual_realizado),
      percentualProjetado: asNumber(cobertura.percentual_projetado),
      margemAtual: asNumber(cobertura.margem_atual),
      margemProjetada: asNumber(cobertura.margem_projetada),
      valorFaltante: asNumber(cobertura.valor_faltante),
    },
    historico: {
      mesesAmostra: asNumber(historico.meses_amostra),
      rotuloAmostra: asString(historico.rotulo_amostra, 'Mês inaugural — sem histórico anterior'),
      mesAnterior: {
        rotulo: typeof mesAnterior.rotulo === 'string' ? mesAnterior.rotulo : null,
        linhaCorte: asNumber(mesAnterior.linha_corte),
        receitas: asNumber(mesAnterior.receitas),
        variacaoPercentual: asNullableNumber(mesAnterior.variacao_percentual),
      },
      mediaTrimestral: {
        linhaCorte: asNumber(mediaTrimestral.linha_corte),
        receitas: asNumber(mediaTrimestral.receitas),
        variacaoPercentual: asNullableNumber(mediaTrimestral.variacao_percentual),
      },
    },
  };
};

export const getCaixaLinhaCorte = async (
  poloId?: string | null,
  competencia?: string,
): Promise<CaixaLinhaCorteResumo> => {
  const normalizedPoloId = !poloId || poloId === 'todos' ? null : poloId;
  const normalizedCompetencia = competencia ? `${competencia.slice(0, 7)}-01` : undefined;

  const { data, error } = await supabase.rpc('get_caixa_linha_corte_secure', {
    p_polo_id: normalizedPoloId,
    p_competencia: normalizedCompetencia,
  });

  if (error) {
    throw error;
  }

  return mapCaixaLinhaCorte(data);
};

export const caixaLinhaCorteQueryOptions = (
  poloId?: string | null,
  competencia?: string,
) => {
  const normalizedPoloId = !poloId || poloId === 'todos' ? 'todos' : poloId;
  const normalizedCompetencia = competencia ? competencia.slice(0, 7) : 'atual';

  return queryOptions({
    queryKey: ['caixa', 'linha-corte', normalizedPoloId, normalizedCompetencia],
    queryFn: () => getCaixaLinhaCorte(poloId, competencia),
    staleTime: 60 * 1000,
  });
};
