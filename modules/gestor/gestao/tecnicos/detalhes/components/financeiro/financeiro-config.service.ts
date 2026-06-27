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
  multaAtraso: number;
  aplicarDescontoMatricula: boolean;
  aplicarMultaJurosMatricula: boolean;
  aplicarDescontoMensalidade: boolean;
  aplicarMultaJurosMensalidade: boolean;
  aplicarDescontoRematricula: boolean;
  aplicarMultaJurosRematricula: boolean;
  diaVencimentoPadrao: number;
  cronogramaFinanceiro: any[];
}

export const DEFAULT_FINANCEIRO_CONFIG: FinanceiroConfigData = {
  valorMatricula: 150.00,
  valorRematricula: 100.00,
  qtdParcelas: 11,
  valorParcela: 350.00,
  descontoPontualidade: 20.00,
  jurosAtraso: 2.0,
  multaAtraso: 5.00,
  aplicarDescontoMatricula: false,
  aplicarMultaJurosMatricula: true,
  aplicarDescontoMensalidade: true,
  aplicarMultaJurosMensalidade: true,
  aplicarDescontoRematricula: true,
  aplicarMultaJurosRematricula: true,
  diaVencimentoPadrao: 10,
  cronogramaFinanceiro: [],
};

export const calcularDataVencimento = (
  dataInicio: string,
  diaVencimento: number,
  offsetMeses: number,
): string => {
  if (!dataInicio) return '';
  const date = new Date(`${dataInicio}T00:00:00`);
  date.setMonth(date.getMonth() + offsetMeses);

  const ano = date.getFullYear();
  const mes = date.getMonth();
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  const diaFinal = Math.min(diaVencimento, ultimoDia);
  const dateFinal = new Date(ano, mes, diaFinal);

  const y = dateFinal.getFullYear();
  const m = String(dateFinal.getMonth() + 1).padStart(2, '0');
  const d = String(dateFinal.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
};

export const buildFinanceiroCronograma = (
  config: FinanceiroConfigData,
  dataInicio: string,
): CronogramaItem[] => {
  const cronograma: CronogramaItem[] = [{
    id: 'matr',
    tipo: 'MATRICULA',
    label: 'Matrícula Inicial',
    valor: config.valorMatricula,
    dataVencimento: dataInicio || '',
  }];

  for (let i = 1; i <= config.qtdParcelas; i += 1) {
    cronograma.push({
      id: `parc-${i}`,
      tipo: 'PARCELA',
      label: `Mensalidade ${i}/${config.qtdParcelas}`,
      valor: config.valorParcela,
      numero: i,
      dataVencimento: calcularDataVencimento(dataInicio, config.diaVencimentoPadrao, i),
    });
  }

  cronograma.push({
    id: 'rem-apos-ciclo',
    tipo: 'REMATRICULA',
    label: 'Rematrícula após o ciclo',
    valor: config.valorRematricula,
    dataVencimento: calcularDataVencimento(dataInicio, config.diaVencimentoPadrao, config.qtdParcelas + 1),
  });

  return cronograma;
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
  async getConfig(turmaId: string): Promise<FinanceiroConfigData> {
    const { data, error } = await supabase
      .from('turmas')
      .select('valor_matricula, valor_rematricula, qtd_parcelas, valor_parcela, desconto_pontualidade, juros_atraso, multa_atraso, aplicar_desconto_matricula, aplicar_multa_juros_matricula, aplicar_desconto_mensalidade, aplicar_multa_juros_mensalidade, aplicar_desconto_rematricula, aplicar_multa_juros_rematricula, dia_vencimento_padrao, cronograma_financeiro')
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
      multaAtraso: Number(data.multa_atraso),
      aplicarDescontoMatricula: data.aplicar_desconto_matricula === true,
      aplicarMultaJurosMatricula: data.aplicar_multa_juros_matricula !== false,
      aplicarDescontoMensalidade: data.aplicar_desconto_mensalidade !== false,
      aplicarMultaJurosMensalidade: data.aplicar_multa_juros_mensalidade !== false,
      aplicarDescontoRematricula: data.aplicar_desconto_rematricula !== false,
      aplicarMultaJurosRematricula: data.aplicar_multa_juros_rematricula !== false,
      diaVencimentoPadrao: Number(data.dia_vencimento_padrao || 10),
      cronogramaFinanceiro: data.cronograma_financeiro || [],
    };
  },

  async calculateRules(config: Pick<FinanceiroConfigData, 'valorParcela' | 'descontoPontualidade' | 'jurosAtraso' | 'multaAtraso'>) {
    const { data, error } = await supabase.rpc('calcular_regras_financeiras_turma', {
      valor_parcela: config.valorParcela,
      desconto_pontualidade: config.descontoPontualidade,
      juros_atraso_percentual: config.jurosAtraso,
      multa_atraso: config.multaAtraso,
    });

    if (error) throw error;
    return data[0];
  },

  saveConfig(turmaId: string, config: FinanceiroConfigData) {
    return gestaoService.saveTurmaFinanceiroConfig(turmaId, config);
  },
};
