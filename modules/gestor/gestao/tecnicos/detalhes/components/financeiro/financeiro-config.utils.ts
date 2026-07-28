import { FinanceiroConfigData } from './financeiro-config.service';

export interface FinanceiroRulesCalculation {
  desconto_aplicado: number;
  juros_calculados: number;
  juros_percentual_dia: number;
  juros_valor_dia: number;
  multa_aplicada: number;
  valor_com_atraso: number;
  valor_com_desconto: number;
}

export interface FinanceiroPolicy {
  label: string;
  descontoKey: keyof Pick<
    FinanceiroConfigData,
    | 'aplicarDescontoMatricula'
    | 'aplicarDescontoMensalidade'
    | 'aplicarDescontoRematricula'
  >;
  multaKey: keyof Pick<
    FinanceiroConfigData,
    | 'aplicarMultaJurosMatricula'
    | 'aplicarMultaJurosMensalidade'
    | 'aplicarMultaJurosRematricula'
  >;
}

export const FINANCEIRO_POLICIES: FinanceiroPolicy[] = [
  {
    label: 'Matrícula',
    descontoKey: 'aplicarDescontoMatricula',
    multaKey: 'aplicarMultaJurosMatricula',
  },
  {
    label: 'Mensalidades',
    descontoKey: 'aplicarDescontoMensalidade',
    multaKey: 'aplicarMultaJurosMensalidade',
  },
  {
    label: 'Rematrícula',
    descontoKey: 'aplicarDescontoRematricula',
    multaKey: 'aplicarMultaJurosRematricula',
  },
];

export const formatCurrencyBRL = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const formatPercentageBR = (value: number, maximumFractionDigits = 4) => (
  value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })
);
