import type {
  MatriculaTecnicaRegra,
  MatriculaTecnicaRegraTurmaInput,
} from './matricula-tecnica-financeiro.types';
import type { FinanceiroRulesCalculation } from './financeiro-config.utils';

export interface CronogramaItem {
  id: string;
  tipo: 'MATRICULA' | 'PARCELA' | 'REMATRICULA';
  label: string;
  valor: number;
  numero?: number;
  dataVencimento?: string;
}

export interface FinanceiroConfigData {
  cobrarMatricula: boolean;
  valorMatricula: number;
  cobrarRematricula: boolean;
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
  cobrarMatricula: true,
  valorMatricula: 0,
  cobrarRematricula: true,
  valorRematricula: 0,
  qtdParcelas: 0,
  valorParcela: 0,
  descontoPontualidade: 0,
  jurosAtraso: 0,
  multaAtrasoPercentual: 0,
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

const decimalToNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const mapRegraTecnicaToConfig = (
  regra: MatriculaTecnicaRegra,
): FinanceiroConfigData => ({
  cobrarMatricula: regra.cobranca.matricula.habilitada,
  valorMatricula: decimalToNumber(regra.cobranca.matricula.valor),
  cobrarRematricula: regra.cobranca.rematricula.habilitada,
  valorRematricula: decimalToNumber(regra.cobranca.rematricula.valor),
  qtdParcelas: regra.cobranca.mensalidade.quantidade,
  valorParcela: decimalToNumber(regra.cobranca.mensalidade.valor),
  descontoPontualidade: decimalToNumber(regra.encargos.descontoPontualidade),
  jurosAtraso: decimalToNumber(regra.encargos.jurosAtrasoPercentual),
  multaAtrasoPercentual: decimalToNumber(regra.encargos.multaAtrasoPercentual),
  aplicarDescontoMatricula: regra.aplicacao.matricula.desconto,
  aplicarMultaJurosMatricula: regra.aplicacao.matricula.multaJuros,
  aplicarDescontoMensalidade: regra.aplicacao.mensalidade.desconto,
  aplicarMultaJurosMensalidade: regra.aplicacao.mensalidade.multaJuros,
  aplicarDescontoRematricula: regra.aplicacao.rematricula.desconto,
  aplicarMultaJurosRematricula: regra.aplicacao.rematricula.multaJuros,
  diaVencimentoPadrao: regra.vencimento.diaBase,
  instrucaoBoletoCarne: regra.boleto.instrucao,
  cronogramaFinanceiro: regra.cronogramaCiclo,
});

export const mapConfigToRegraTecnicaInput = (
  config: FinanceiroConfigData,
): MatriculaTecnicaRegraTurmaInput => ({
  cobrarMatricula: config.cobrarMatricula,
  valorMatricula: String(config.valorMatricula),
  qtdMensalidades: config.qtdParcelas,
  valorMensalidade: String(config.valorParcela),
  cobrarRematricula: config.cobrarRematricula,
  valorRematricula: String(config.valorRematricula),
  diaVencimento: config.diaVencimentoPadrao,
  descontoPontualidade: String(config.descontoPontualidade),
  jurosAtrasoPercentual: String(config.jurosAtraso),
  multaAtrasoPercentual: String(config.multaAtrasoPercentual),
  aplicarDescontoMatricula: config.aplicarDescontoMatricula,
  aplicarMultaJurosMatricula: config.aplicarMultaJurosMatricula,
  aplicarDescontoMensalidade: config.aplicarDescontoMensalidade,
  aplicarMultaJurosMensalidade: config.aplicarMultaJurosMensalidade,
  aplicarDescontoRematricula: config.aplicarDescontoRematricula,
  aplicarMultaJurosRematricula: config.aplicarMultaJurosRematricula,
  instrucaoBoleto: config.instrucaoBoletoCarne.trim(),
});

const addMonthsToDateString = (dateStr: string, monthsToAdd: number, targetDay: number): string => {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);

  const targetDate = new Date(year, month + monthsToAdd, 1);
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth();
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const finalDay = Math.min(targetDay || day, lastDay);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(finalDay)}`;
};

export const mapRegraTecnicaCronograma = (
  regra: MatriculaTecnicaRegra,
): CronogramaItem[] => {
  const items: CronogramaItem[] = regra.cronogramaCiclo.map((item) => ({
    id: item.id,
    tipo: item.tipo === 'MENSALIDADE' ? 'PARCELA' : item.tipo,
    label: item.label,
    valor: decimalToNumber(item.valor),
    numero: item.numero || undefined,
    dataVencimento: item.dataVencimento,
  }));

  // Se a rematrícula estiver habilitada, projeta também as parcelas do Ciclo 2 no cronograma
  if (regra.cobranca.rematricula.habilitada) {
    const rematricula = items.find((i) => i.tipo === 'REMATRICULA');
    const valorParcela = decimalToNumber(regra.cobranca.mensalidade.valor);
    const qtd = regra.cobranca.mensalidade.quantidade;
    const diaBase = regra.vencimento.diaBase;
    const baseDateStr = rematricula?.dataVencimento || regra.vencimento.primeiroVencimentoSugerido;

    if (baseDateStr) {
      for (let num = 1; num <= qtd; num++) {
        const dueDate = addMonthsToDateString(baseDateStr, num, diaBase);
        items.push({
          id: `ciclo-2-mensalidade-${num}`,
          tipo: 'PARCELA',
          label: `Mensalidade ${num}/${qtd} (Ciclo 2)`,
          valor: valorParcela,
          numero: num,
          dataVencimento: dueDate,
        });
      }
    }
  }

  return items;
};

export const mapRegraTecnicaCalculo = (
  regra: MatriculaTecnicaRegra,
): FinanceiroRulesCalculation | undefined => {
  const item = regra.cronogramaCiclo.find((entry) => entry.tipo === 'MENSALIDADE');
  if (!item) return undefined;
  return {
    desconto_aplicado: decimalToNumber(item.simulacao.descontoAplicado),
    juros_calculados: decimalToNumber(item.simulacao.jurosMensal),
    juros_percentual_dia: decimalToNumber(item.simulacao.jurosPercentualDia),
    juros_valor_dia: decimalToNumber(item.simulacao.jurosValorDia),
    multa_aplicada: decimalToNumber(item.simulacao.multa),
    valor_com_atraso: decimalToNumber(item.simulacao.valorComAtraso),
    valor_com_desconto: decimalToNumber(item.simulacao.valorComDesconto),
  };
};
