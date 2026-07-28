import { supabase } from '../../../../../../../lib/supabase';
import { gestaoService } from '../../../../gestao.service';

export interface CronogramaItem {
  id: string;
  tipo: 'MATRICULA' | 'PARCELA' | 'REMATRICULA';
  label: string;
  valor: number;
  numero?: number;
  dataVencimento?: string;
}

export interface FinanceiroConfigData {
  valorMatricula: number;
  valorRematricula: number;
  qtdParcelas: number;
  valorParcela: number;
  descontoPontualidade: number;
  jurosAtraso: number;
  multaAtrasoPercentual: number;
  aplicarDescontoMatricula: boolean;
  aplicarMultaJurosMatricula: boolean;
  aplicarDescontoMensalidade: boolean;
  aplicarMultaJurosMensalidade: boolean;
  aplicarDescontoRematricula: boolean;
  aplicarMultaJurosRematricula: boolean;
  diaVencimentoPadrao: number;
  instrucaoBoletoCarne: string;
  cronogramaFinanceiro: any[];
}

export type FinanceiroCalculationInput = Pick<
  FinanceiroConfigData,
  | 'valorParcela'
  | 'descontoPontualidade'
  | 'jurosAtraso'
  | 'aplicarDescontoMensalidade'
  | 'aplicarMultaJurosMensalidade'
> & {
  multaAtraso?: number;
  multaAtrasoPercentual?: number;
};

export const DEFAULT_INSTRUCAO_BOLETO_CARNE =
  'SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO.';

export const DEFAULT_FINANCEIRO_CONFIG: FinanceiroConfigData = {
  valorMatricula: 150.00,
  valorRematricula: 150.00,
  qtdParcelas: 12,
  valorParcela: 279.90,
  descontoPontualidade: 19.90,
  jurosAtraso: 1.0,
  multaAtrasoPercentual: 2.0,
  aplicarDescontoMatricula: false,
  aplicarMultaJurosMatricula: false,
  aplicarDescontoMensalidade: true,
  aplicarMultaJurosMensalidade: true,
  aplicarDescontoRematricula: false,
  aplicarMultaJurosRematricula: false,
  diaVencimentoPadrao: 10,
  instrucaoBoletoCarne: DEFAULT_INSTRUCAO_BOLETO_CARNE,
  cronogramaFinanceiro: [],
};

export const mapSavedCronograma = (items: any[]): CronogramaItem[] => items.map((item: any) => ({
  id: item.id,
  tipo: item.tipo,
  label: item.label,
  valor: Number(item.valor),
  numero: item.numero,
  dataVencimento: item.dataVencimento,
}));

export const shouldUseSavedCronograma = (
  cronogramaFinanceiro: any[],
  qtdParcelas: number,
) => {
  const savedCronograma = Array.isArray(cronogramaFinanceiro) ? cronogramaFinanceiro : [];
  const parcelasSalvas = savedCronograma.filter((item: any) => item?.tipo === 'PARCELA').length;
  const hasCronogramaLegado = parcelasSalvas > qtdParcelas
    || savedCronograma.some((item: any) =>
      String(item?.id || '').startsWith('rem-12') || String(item?.label || '').includes('Semestral')
    );

  return savedCronograma.length > 0 && !hasCronogramaLegado;
};

export const financeiroConfigService = {
  async buildSchedule(config: FinanceiroConfigData, dataInicio: string): Promise<CronogramaItem[]> {
    const { data, error } = await supabase.rpc('build_gestao_financial_schedule', {
      p_data_inicio: dataInicio || null,
      p_valor_matricula: config.valorMatricula,
      p_valor_parcela: config.valorParcela,
      p_valor_rematricula: config.valorRematricula,
      p_qtd_parcelas: config.qtdParcelas,
      p_dia_vencimento: config.diaVencimentoPadrao,
    });

    if (error) throw error;
    return mapSavedCronograma((data || []) as any[]);
  },

  async getConfig(turmaId: string): Promise<FinanceiroConfigData> {
    const { data, error } = await supabase
      .from('turmas')
      .select('valor_matricula, valor_rematricula, qtd_parcelas, valor_parcela, desconto_pontualidade, juros_atraso, multa_atraso_percentual, aplicar_desconto_matricula, aplicar_multa_juros_matricula, aplicar_desconto_mensalidade, aplicar_multa_juros_mensalidade, aplicar_desconto_rematricula, aplicar_multa_juros_rematricula, dia_vencimento_padrao, instrucao_boleto_carne, cronograma_financeiro')
      .eq('id', turmaId)
      .single();

    if (error) throw error;

    return {
      valorMatricula: Number(data.valor_matricula),
      valorRematricula: Number(data.valor_rematricula),
      qtdParcelas: Number(data.qtd_parcelas),
      valorParcela: Number(data.valor_parcela),
      descontoPontualidade: Number(data.desconto_pontualidade),
      jurosAtraso: Number(data.juros_atraso),
      multaAtrasoPercentual: Number(data.multa_atraso_percentual),
      aplicarDescontoMatricula: false,
      aplicarMultaJurosMatricula: false,
      aplicarDescontoMensalidade: true,
      aplicarMultaJurosMensalidade: true,
      aplicarDescontoRematricula: false,
      aplicarMultaJurosRematricula: false,
      diaVencimentoPadrao: Number(data.dia_vencimento_padrao || 10),
      instrucaoBoletoCarne: String(
        data.instrucao_boleto_carne || DEFAULT_INSTRUCAO_BOLETO_CARNE,
      ).trim(),
      cronogramaFinanceiro: data.cronograma_financeiro || [],
    };
  },

  async calculateRules(config: FinanceiroCalculationInput) {
    const usesPercentageFine = config.multaAtrasoPercentual !== undefined;
    const rpcName = usesPercentageFine
      ? 'calculate_gestao_technical_financial_preview'
      : 'calculate_gestao_financial_preview';
    const params = {
      p_valor: config.valorParcela,
      p_desconto: config.descontoPontualidade,
      p_juros_percentual: config.jurosAtraso,
      p_aplicar_desconto: config.aplicarDescontoMensalidade,
      p_aplicar_encargos: config.aplicarMultaJurosMensalidade,
      ...(usesPercentageFine
        ? { p_multa_percentual: config.multaAtrasoPercentual }
        : { p_multa: config.multaAtraso || 0 }),
    };
    const { data, error } = await supabase.rpc(rpcName, params);

    if (error) throw error;
    return data[0];
  },

  saveConfig(turmaId: string, config: FinanceiroConfigData) {
    return gestaoService.saveTurmaFinanceiroConfig(turmaId, config);
  },
};
