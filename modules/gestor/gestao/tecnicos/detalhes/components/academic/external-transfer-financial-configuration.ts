import { getMaceioIsoDate } from '../../../technicalClassDates';
import {
  isExternalTransferMoney, isExternalTransferRate, isTransferDate,
  type ExternalTransferPreview, type ExternalTransferScheduleAdjustment,
} from './external-transfer.contract';

export interface ExternalTransferCycleValues {
  enabled: boolean;
  cobrarMensalidades: boolean;
  quantidadeParcelas: string;
  primeiroVencimento: string;
  periodicidade: 'MENSAL_CALENDARIO' | 'DIAS_CORRIDOS_30';
  valorMensalidade: string;
  cobrarTaxa: boolean;
  valorTaxa: string;
  vencimentoTaxa: string;
  aplicarDesconto: boolean;
  descontoPontualidade: string;
  aplicarJuros: boolean;
  jurosAtrasoPercentual: string;
  aplicarMulta: boolean;
  multaAtrasoPercentual: string;
}
export type ExternalTransferCycleConfiguration = ExternalTransferCycleValues & {
  changedKeys: Array<keyof ExternalTransferCycleValues>;
  hasIndividualConditions?: boolean;
};
export type ExternalTransferFinancialConfigurations = Record<1 | 2, ExternalTransferCycleConfiguration>;
type CycleAdjustment = Extract<ExternalTransferScheduleAdjustment, { acao: 'CONFIGURAR_CICLO' }>;

export const createExternalTransferFinancialConfigurations = (preview: ExternalTransferPreview): ExternalTransferFinancialConfigurations => {
  const cycle = (number: 1 | 2): ExternalTransferCycleConfiguration => {
    const items = preview.financeiro.itens.filter((item) => item.cicloNumero === number);
    const monthly = items.filter((item) => item.tipo === 'PARCELA');
    const fee = items.find((item) => item.tipo !== 'PARCELA');
    const application = preview.regra.aplicacao.mensalidade;
    const discount = monthly[0]?.descontoPontualidade
      ?? (application.desconto ? preview.regra.encargos.descontoPontualidade : '0.00');
    const interest = monthly[0]?.jurosAtrasoPercentual
      ?? (application.multaJuros ? preview.regra.encargos.jurosAtrasoPercentual : '0.000000');
    const penalty = monthly[0]?.multaAtrasoPercentual
      ?? (application.multaJuros ? preview.regra.encargos.multaAtrasoPercentual : '0.000000');
    return {
      enabled: items.length > 0, cobrarMensalidades: monthly.length > 0,
      quantidadeParcelas: String(monthly.length), primeiroVencimento: monthly[0]?.vencimento || '',
      periodicidade: 'MENSAL_CALENDARIO', valorMensalidade: monthly[0]?.valor ?? preview.regra.valorMensalidade,
      cobrarTaxa: Boolean(fee), valorTaxa: fee?.valor ?? (number === 1 ? preview.regra.valorMatricula : preview.regra.valorRematricula),
      vencimentoTaxa: fee?.vencimento || '',
      aplicarDesconto: Number(discount) > 0, descontoPontualidade: discount,
      aplicarJuros: Number(interest) > 0, jurosAtrasoPercentual: interest,
      aplicarMulta: Number(penalty) > 0, multaAtrasoPercentual: penalty,
      changedKeys: [],
      hasIndividualConditions: (['valor', 'descontoPontualidade', 'jurosAtrasoPercentual', 'multaAtrasoPercentual'] as const).some((field) => (
        new Set(monthly.map((item) => Number(item[field]))).size > 1
      )),
    };
  };
  return { 1: cycle(1), 2: cycle(2) };
};

export const updateExternalTransferFinancialConfiguration = <K extends keyof ExternalTransferCycleValues>(
  configurations: ExternalTransferFinancialConfigurations,
  cycle: 1 | 2,
  field: K,
  value: ExternalTransferCycleValues[K],
): ExternalTransferFinancialConfigurations => {
  const previous = configurations[cycle];
  return { ...configurations, [cycle]: {
    ...previous, [field]: value,
    changedKeys: [...new Set([...previous.changedKeys, field])],
  } };
};

export const externalTransferFinancialConfigurationError = (
  configurations: ExternalTransferFinancialConfigurations,
  preview: ExternalTransferPreview,
  today = getMaceioIsoDate(),
): string | null => {
  for (const cycle of ([1, 2] as const).filter((value) => value <= preview.maxCiclos)) {
    const value = configurations[cycle];
    if (!value.enabled) continue;
    if (value.cobrarMensalidades) {
      const quantity = Number(value.quantidadeParcelas);
      if (!/^\d{1,2}$/.test(value.quantidadeParcelas) || !Number.isInteger(quantity) || quantity < 1 || quantity > preview.quantidadeMaxima) {
        return `C${cycle}: informe de 1 a ${preview.quantidadeMaxima} mensalidades ou desative a cobrança de mensalidades.`;
      }
      if (!isExternalTransferMoney(value.valorMensalidade) || Number(value.valorMensalidade) <= 0) return `C${cycle}: informe um valor positivo para as mensalidades.`;
      if (!isTransferDate(value.primeiroVencimento) || value.primeiroVencimento < today) return `C${cycle}: informe o primeiro vencimento das mensalidades, sem data passada.`;
      if (!['MENSAL_CALENDARIO', 'DIAS_CORRIDOS_30'].includes(value.periodicidade)) return `C${cycle}: escolha a periodicidade das mensalidades.`;
      if (value.aplicarDesconto && (!isExternalTransferMoney(value.descontoPontualidade)
        || Number(value.descontoPontualidade) >= Number(value.valorMensalidade))) return `C${cycle}: o desconto deve ser válido e menor que a mensalidade.`;
      if (value.aplicarJuros && !isExternalTransferRate(value.jurosAtrasoPercentual)) return `C${cycle}: os juros devem ficar abaixo de 100%.`;
      if (value.aplicarMulta && !isExternalTransferRate(value.multaAtrasoPercentual)) return `C${cycle}: a multa deve ficar abaixo de 100%.`;
    }
    if (value.cobrarTaxa) {
      const name = cycle === 1 ? 'matrícula' : 'rematrícula';
      if (!isExternalTransferMoney(value.valorTaxa) || Number(value.valorTaxa) <= 0) return `C${cycle}: informe um valor positivo para a ${name}.`;
      if (!isTransferDate(value.vencimentoTaxa) || value.vencimentoTaxa < today) return `C${cycle}: informe o vencimento da ${name}, sem data passada.`;
    }
  }
  return null;
};

export const buildExternalTransferFinancialAdjustments = (
  configurations: ExternalTransferFinancialConfigurations,
  preview: ExternalTransferPreview,
  today = getMaceioIsoDate(),
): CycleAdjustment[] => {
  const error = externalTransferFinancialConfigurationError(configurations, preview, today);
  if (error) throw new Error(error);
  const result: CycleAdjustment[] = [];
  for (const cycle of ([1, 2] as const).filter((value) => value <= preview.maxCiclos)) {
    const value = configurations[cycle];
    if (value.changedKeys.length === 0) continue;
    if (!value.enabled) {
      result.push({ acao: 'CONFIGURAR_CICLO', cicloNumero: cycle, quantidadeParcelas: 0, cobrarTaxa: false });
      continue;
    }
    const all = value.changedKeys.includes('enabled');
    const changed = (...fields: Array<keyof ExternalTransferCycleValues>) => all || fields.some((field) => value.changedKeys.includes(field));
    const adjustment: CycleAdjustment = { acao: 'CONFIGURAR_CICLO', cicloNumero: cycle };
    if (changed('cobrarMensalidades', 'quantidadeParcelas')) adjustment.quantidadeParcelas = value.cobrarMensalidades ? Number(value.quantidadeParcelas) : 0;
    if (value.cobrarMensalidades) {
      if (changed('cobrarMensalidades', 'primeiroVencimento', 'periodicidade')) adjustment.primeiroVencimento = value.primeiroVencimento;
      if (changed('cobrarMensalidades', 'periodicidade', 'quantidadeParcelas', 'primeiroVencimento')) adjustment.periodicidade = value.periodicidade;
      if (changed('cobrarMensalidades', 'valorMensalidade')) adjustment.valorMensalidade = value.valorMensalidade;
      if (changed('cobrarMensalidades', 'aplicarDesconto', 'descontoPontualidade')) adjustment.descontoPontualidade = value.aplicarDesconto ? value.descontoPontualidade : '0.00';
      if (changed('cobrarMensalidades', 'aplicarJuros', 'jurosAtrasoPercentual')) adjustment.jurosAtrasoPercentual = value.aplicarJuros ? value.jurosAtrasoPercentual : '0.000000';
      if (changed('cobrarMensalidades', 'aplicarMulta', 'multaAtrasoPercentual')) adjustment.multaAtrasoPercentual = value.aplicarMulta ? value.multaAtrasoPercentual : '0.000000';
      if ('descontoPontualidade' in adjustment || 'jurosAtrasoPercentual' in adjustment || 'multaAtrasoPercentual' in adjustment) {
        adjustment.alvoEncargos = 'MENSALIDADES';
      }
    }
    if (changed('cobrarTaxa')) adjustment.cobrarTaxa = value.cobrarTaxa;
    if (value.cobrarTaxa) {
      if (changed('cobrarTaxa', 'valorTaxa')) adjustment.valorTaxa = value.valorTaxa;
      if (changed('cobrarTaxa', 'vencimentoTaxa')) adjustment.vencimentoTaxa = value.vencimentoTaxa;
    }
    if (Object.keys(adjustment).length > 2) result.push(adjustment);
  }
  return result;
};

export const clearExternalTransferFinancialConfigurationChanges = (
  configurations: ExternalTransferFinancialConfigurations,
  cycle?: 1 | 2,
): ExternalTransferFinancialConfigurations => ({
  1: cycle === 2 ? configurations[1] : { ...configurations[1], changedKeys: [] },
  2: cycle === 1 ? configurations[2] : { ...configurations[2], changedKeys: [] },
});

export const syncExternalTransferFinancialConfigurations = (
  configurations: ExternalTransferFinancialConfigurations,
  preview: ExternalTransferPreview,
  items: ExternalTransferPreview['financeiro']['itens'],
): ExternalTransferFinancialConfigurations => {
  const hydrated = createExternalTransferFinancialConfigurations({ ...preview, financeiro: { versao: 3, itens: items } });
  const sync = (cycle: 1 | 2): ExternalTransferCycleConfiguration => {
    const current = configurations[cycle];
    if (!current.enabled && !items.some((item) => item.cicloNumero === cycle)) return current;
    const monthlyOptions = !hydrated[cycle].cobrarMensalidades ? {
      quantidadeParcelas: current.quantidadeParcelas, primeiroVencimento: current.primeiroVencimento,
      valorMensalidade: current.valorMensalidade, aplicarDesconto: current.aplicarDesconto,
      descontoPontualidade: current.descontoPontualidade, aplicarJuros: current.aplicarJuros,
      jurosAtrasoPercentual: current.jurosAtrasoPercentual, aplicarMulta: current.aplicarMulta,
      multaAtrasoPercentual: current.multaAtrasoPercentual,
    } : {};
    const feeOptions = !hydrated[cycle].cobrarTaxa
      ? { valorTaxa: current.valorTaxa, vencimentoTaxa: current.vencimentoTaxa } : {};
    return {
      ...hydrated[cycle], ...monthlyOptions, ...feeOptions, periodicidade: current.periodicidade,
      ...Object.fromEntries(current.changedKeys.map((key) => [key, current[key]])),
      changedKeys: [...current.changedKeys],
    };
  };
  return { 1: sync(1), 2: sync(2) };
};
