export interface ExternalTransferCredit {
  disciplinaId: string;
  mediaFinal: number | null;
  frequenciaPercent: number | null;
  situacao: 'APROVEITADO' | 'DISPENSADO' | 'EQUIVALENCIA';
}

export type { TransferScheduleItem as ExternalTransferScheduleItem, TransferSchedulePlan as ExternalTransferFinancialPlan } from '../../../../../../../supabase/functions/_shared/technical-transfer-schedule';
import { isTransferSchedulePlan, type TransferScheduleItem as ExternalTransferScheduleItem, type TransferSchedulePlan as ExternalTransferFinancialPlan } from '../../../../../../../supabase/functions/_shared/technical-transfer-schedule';
export type ExternalTransferScheduleAdjustment = {
  acao: 'ADICIONAR_ITEM'; itemId: string; cicloNumero: 1 | 2; tipo: ExternalTransferScheduleItem['tipo']; valor?: string;
  periodicidade?: 'MENSAL_CALENDARIO' | 'DIAS_CORRIDOS_30';
} | {
  acao: 'CONFIGURAR_CICLO'; cicloNumero: 1 | 2;
  quantidadeParcelas?: number; primeiroVencimento?: string;
  vencimentoTaxa?: string; periodicidade?: 'MENSAL_CALENDARIO' | 'DIAS_CORRIDOS_30';
  alvoEncargos?: 'MENSALIDADES';
  valorMensalidade?: string; cobrarTaxa?: boolean; valorTaxa?: string;
  descontoPontualidade?: string; jurosAtrasoPercentual?: string; multaAtrasoPercentual?: string;
};

// V2 conditions remain readable in previously received downstream plans.
export interface ExternalTransferConditions {
  cobrarMatricula: boolean;
  valorMatricula: string;
  valorMensalidade: string;
  cobrarRematricula: boolean;
  valorRematricula: string;
  descontoPontualidade: string;
  jurosAtrasoPercentual: string;
  multaAtrasoPercentual: string;
  aplicarDescontoMatricula: boolean;
  aplicarMultaJurosMatricula: boolean;
  aplicarDescontoMensalidade: boolean;
  aplicarMultaJurosMensalidade: boolean;
  aplicarDescontoRematricula: boolean;
  aplicarMultaJurosRematricula: boolean;
}


interface Application { desconto: boolean; multaJuros: boolean }
export interface ExternalTransferCycleTotal {
  cicloNumero: 1 | 2;
  totalNominal: string;
  quantidadeParcelas: number;
  quantidadeItens: number;
}
export interface ExternalTransferPreview {
  versao: 3;
  regraFingerprint: string;
  quantidadeMaxima: number;
  maxCiclos: 1 | 2;
  financeiro: ExternalTransferFinancialPlan;
  totais: { porCiclo: ExternalTransferCycleTotal[]; totalNominal: string };
  regra: {
    valorMatricula: string; valorMensalidade: string; valorRematricula: string;
    encargos: { descontoPontualidade: string; jurosAtrasoPercentual: string; multaAtrasoPercentual: string };
    aplicacao: { matricula: Application; mensalidade: Application; rematricula: Application };
  };
  avisos: string[];
}
export interface ExternalTransferInput {
  requestId: string; alunoId: string; turmaDestinoId: string;
  instituicaoOrigem: string; cursoOrigem: null; motivo: string; observacao: string | null;
  dataTransferencia: string; aproveitamentos: ExternalTransferCredit[];
  financeiro: ExternalTransferFinancialPlan; expectedRegraFingerprint: string;
}
export interface ExternalTransferResult {
  versao: 3; requestId: string; replayed: boolean; matriculaId: string; transferenciaId: string;
  financeiro: ExternalTransferPreview; cobrancaGerada: false;
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const decimal = (value: unknown) => typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));
const application = (value: unknown) => record(value) && typeof value.desconto === 'boolean' && typeof value.multaJuros === 'boolean';
export const isExternalTransferMoney = (value: unknown): value is string => decimal(value)
  && /^\d{1,8}(?:\.\d{1,2})?$/.test(String(value)) && Number(value) <= 9999999.99;
export const isExternalTransferItemId = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const conditionAmounts: Array<keyof ExternalTransferConditions> = [
  'valorMatricula', 'valorMensalidade', 'valorRematricula', 'descontoPontualidade',
  'jurosAtrasoPercentual', 'multaAtrasoPercentual',
];
const conditionFlags: Array<keyof ExternalTransferConditions> = [
  'cobrarMatricula', 'cobrarRematricula', 'aplicarDescontoMatricula', 'aplicarMultaJurosMatricula',
  'aplicarDescontoMensalidade', 'aplicarMultaJurosMensalidade', 'aplicarDescontoRematricula', 'aplicarMultaJurosRematricula',
];
export const isExternalTransferRate = (value: unknown): value is string => typeof value === 'string'
  && /^\d{1,3}(?:\.\d{1,6})?$/.test(value) && Number(value) < 100;

export const isExternalTransferConditions = (value: unknown): value is ExternalTransferConditions => record(value)
  && conditionAmounts.every((key) => key === 'jurosAtrasoPercentual' || key === 'multaAtrasoPercentual'
    ? isExternalTransferRate(value[key])
    : decimal(value[key]) && /^\d+(?:\.\d{1,2})?$/.test(String(value[key])) && Number(value[key]) <= 9999999.99)
  && conditionFlags.every((key) => typeof value[key] === 'boolean')
  && (!value.cobrarMatricula || Number(value.valorMatricula) > 0)
  && (!value.cobrarRematricula || Number(value.valorRematricula) > 0);


export const isTransferDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};


export const isExternalTransferScheduleItem = (value: unknown): value is ExternalTransferScheduleItem => isTransferSchedulePlan({ versao: 3, itens: [value] });
export const isExternalTransferFinancialPlan = (value: unknown, maxCiclos: 1 | 2, maximum = 60): value is ExternalTransferFinancialPlan => (
  isTransferSchedulePlan(value, maxCiclos) && ([1, 2] as const).every((cycle) => value.itens.filter((item) => item.cicloNumero === cycle && item.tipo === 'PARCELA').length <= maximum)
);

export const requireExternalTransferPreview = (value: unknown): ExternalTransferPreview => {
  if (!record(value) || value.versao !== 3 || !text(value.regraFingerprint)
    || !Number.isInteger(value.quantidadeMaxima) || Number(value.quantidadeMaxima) < 1 || Number(value.quantidadeMaxima) > 60
    || (value.maxCiclos !== 1 && value.maxCiclos !== 2)
    || !isExternalTransferFinancialPlan(value.financeiro, value.maxCiclos, Number(value.quantidadeMaxima))
    || !record(value.regra) || !record(value.totais) || !Array.isArray(value.totais.porCiclo)
    || !decimal(value.totais.totalNominal) || value.totais.porCiclo.length !== value.maxCiclos
    || !Array.isArray(value.avisos) || !value.avisos.every(text)) throw new Error('O servidor não retornou o cronograma completo da transferência.');
  const totals = value.totais.porCiclo;
  if (!totals.every((total) => record(total) && (total.cicloNumero === 1 || total.cicloNumero === 2)
    && total.cicloNumero <= Number(value.maxCiclos) && decimal(total.totalNominal)
    && Number.isInteger(total.quantidadeParcelas) && Number(total.quantidadeParcelas) >= 0 && Number(total.quantidadeParcelas) <= Number(value.quantidadeMaxima)
    && Number.isInteger(total.quantidadeItens) && Number(total.quantidadeItens) >= 0 && Number(total.quantidadeItens) <= Number(value.quantidadeMaxima) + 1)
    || new Set(totals.map((total) => (total as Record<string, unknown>).cicloNumero)).size !== totals.length) throw new Error('Os totais do cronograma estão incompletos.');
  const rule = value.regra;
  if (!decimal(rule.valorMatricula) || !decimal(rule.valorMensalidade) || !decimal(rule.valorRematricula)
    || !record(rule.encargos) || !decimal(rule.encargos.descontoPontualidade) || !decimal(rule.encargos.jurosAtrasoPercentual) || !decimal(rule.encargos.multaAtrasoPercentual)
    || !record(rule.aplicacao) || !application(rule.aplicacao.matricula) || !application(rule.aplicacao.mensalidade) || !application(rule.aplicacao.rematricula)) throw new Error('Os padrões financeiros da turma não foram retornados.');
  return value as unknown as ExternalTransferPreview;
};
export const requireExternalTransferResult = (value: unknown, requestId: string): ExternalTransferResult => {
  if (!record(value) || value.versao !== 3 || value.requestId !== requestId || typeof value.replayed !== 'boolean'
    || !text(value.matriculaId) || !text(value.transferenciaId) || value.cobrancaGerada !== false) throw new Error('Não foi possível confirmar o recebimento. Confira a mesma operação.');
  return { ...value, financeiro: requireExternalTransferPreview(value.financeiro) } as ExternalTransferResult;
};
export const transferErrorMessage = (error: unknown): string => (
  record(error) && text(error.message) ? error.message : 'Não foi possível confirmar a operação. Tente novamente.'
);

// Only a returned transaction rejection proves that this attempt did not commit.
export const isDefiniteTransferRejection = (error: unknown) => (
  record(error) && typeof error.code === 'string'
  && (/^(22|23|42|P0)[A-Z0-9]{3}$/.test(error.code) || ['40001', '40P01'].includes(error.code))
);
