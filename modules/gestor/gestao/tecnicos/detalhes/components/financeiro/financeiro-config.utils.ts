import { FinanceiroConfigData } from './financeiro-config.service';

export interface FinanceiroRulesCalculation {
  juros_calculados: number;
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
