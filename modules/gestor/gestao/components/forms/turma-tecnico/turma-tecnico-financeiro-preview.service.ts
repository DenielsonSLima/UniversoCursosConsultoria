import { supabase } from '../../../../../../lib/supabase';

export interface TurmaTecnicoFinanceiroPreviewInput {
  dataInicio: string;
  cobrarMatricula: boolean;
  valorMatricula: number;
  cobrarRematricula: boolean;
  valorRematricula: number;
  qtdParcelas: number;
  valorParcela: number;
  descontoPontualidade: number;
  jurosAtraso: number;
  multaAtrasoPercentual: number;
  aplicarDescontoMensalidade: boolean;
  aplicarMultaJurosMensalidade: boolean;
  diaVencimentoPadrao: number;
}

export interface TurmaTecnicoFinanceiroPreview {
  descontoAplicado: number;
  jurosMensal: number;
  jurosPercentualDia: number;
  jurosValorDia: number;
  multaAplicada: number;
  valorComDesconto: number;
  valorComAtraso: number;
  totalCurso: number;
}

interface FinancialPreviewRow {
  desconto_aplicado?: unknown;
  juros_calculados?: unknown;
  juros_percentual_dia?: unknown;
  juros_valor_dia?: unknown;
  multa_aplicada?: unknown;
  valor_com_desconto?: unknown;
  valor_com_atraso?: unknown;
}

interface FinancialScheduleItem {
  tipo?: unknown;
  valor?: unknown;
}

const finiteNumber = (value: unknown, field: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`A prévia financeira não retornou ${field}.`);
  }
  return parsed;
};

export const getTurmaTecnicoFinanceiroPreview = async (
  input: TurmaTecnicoFinanceiroPreviewInput,
): Promise<TurmaTecnicoFinanceiroPreview> => {
  const [calculationResult, scheduleResult] = await Promise.all([
    supabase.rpc('calculate_gestao_technical_financial_preview', {
      p_valor: input.valorParcela,
      p_desconto: input.descontoPontualidade,
      p_juros_percentual: input.jurosAtraso,
      p_multa_percentual: input.multaAtrasoPercentual,
      p_aplicar_desconto: input.aplicarDescontoMensalidade,
      p_aplicar_encargos: input.aplicarMultaJurosMensalidade,
    }),
    supabase.rpc('build_gestao_financial_schedule', {
      p_data_inicio: input.dataInicio,
      p_valor_matricula: input.cobrarMatricula ? input.valorMatricula : 0,
      p_valor_parcela: input.valorParcela,
      p_valor_rematricula: input.cobrarRematricula ? input.valorRematricula : 0,
      p_qtd_parcelas: input.qtdParcelas,
      p_dia_vencimento: input.diaVencimentoPadrao,
    }),
  ]);

  if (calculationResult.error) throw calculationResult.error;
  if (scheduleResult.error) throw scheduleResult.error;

  const previewRow = (Array.isArray(calculationResult.data)
    ? calculationResult.data[0]
    : calculationResult.data) as FinancialPreviewRow | null;
  const schedule = (Array.isArray(scheduleResult.data)
    ? scheduleResult.data
    : []) as FinancialScheduleItem[];

  if (!previewRow || schedule.length === 0) {
    throw new Error('O servidor não retornou a prévia financeira completa.');
  }

  const totalPrimeiroCiclo = schedule.reduce(
    (total, item) => total + finiteNumber(item.valor, 'o valor do cronograma'),
    0,
  );
  const totalMensalidadesSegundoCiclo = input.cobrarRematricula
    ? schedule
      .filter((item) => String(item.tipo || '').toUpperCase() === 'PARCELA')
      .reduce(
        (total, item) => total + finiteNumber(item.valor, 'o valor da mensalidade do segundo ciclo'),
        0,
      )
    : 0;

  return {
    descontoAplicado: finiteNumber(previewRow.desconto_aplicado, 'o desconto'),
    jurosMensal: finiteNumber(previewRow.juros_calculados, 'os juros mensais'),
    jurosPercentualDia: finiteNumber(previewRow.juros_percentual_dia, 'os juros diários'),
    jurosValorDia: finiteNumber(previewRow.juros_valor_dia, 'o valor diário dos juros'),
    multaAplicada: finiteNumber(previewRow.multa_aplicada, 'a multa'),
    valorComDesconto: finiteNumber(previewRow.valor_com_desconto, 'o valor com desconto'),
    valorComAtraso: finiteNumber(previewRow.valor_com_atraso, 'o valor com atraso'),
    totalCurso: totalPrimeiroCiclo + totalMensalidadesSegundoCiclo,
  };
};
