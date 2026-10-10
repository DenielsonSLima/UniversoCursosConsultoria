export interface ExternalTransferCredit {
  disciplinaId: string;
  mediaFinal: number | null;
  frequenciaPercent: number | null;
  situacao: 'APROVEITADO' | 'DISPENSADO' | 'EQUIVALENCIA';
}

export interface ExternalTransferFinancialPlan {
  cicloNumero: 1 | 2;
  quantidadeParcelas: number;
  primeiroVencimento: string;
  justificativaCiclo2: string | null;
  cobrarMensalidades: boolean;
  condicoes: ExternalTransferConditions;
}

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
export interface ExternalTransferPreview {
  versao: 2;
  regraFingerprint: string;
  quantidadeMaxima: number;
  maxCiclos: 1 | 2;
  financeiro: ExternalTransferFinancialPlan;
  totais: { cicloInicialNominal: string; totalNominal: string };
  regra: {
    valorMatricula: string;
    valorMensalidade: string;
    valorRematricula: string;
    encargos: {
      descontoPontualidade: string;
      jurosAtrasoPercentual: string;
      multaAtrasoPercentual: string;
    };
    aplicacao: { matricula: Application; mensalidade: Application; rematricula: Application };
  };
  avisos: string[];
}

export interface ExternalTransferInput {
  requestId: string;
  alunoId: string;
  turmaDestinoId: string;
  instituicaoOrigem: string;
  cursoOrigem: string | null;
  motivo: string;
  observacao: string | null;
  dataTransferencia: string;
  aproveitamentos: ExternalTransferCredit[];
  financeiro: ExternalTransferFinancialPlan;
  expectedRegraFingerprint: string;
}

export interface ExternalTransferResult {
  versao: 2;
  requestId: string;
  replayed: boolean;
  matriculaId: string;
  transferenciaId: string;
  financeiro: ExternalTransferPreview;
  cobrancaGerada: false;
}

const record = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const decimal = (value: unknown) => typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));
const application = (value: unknown) => record(value)
  && typeof value.desconto === 'boolean' && typeof value.multaJuros === 'boolean';
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

export const requireExternalTransferPreview = (value: unknown): ExternalTransferPreview => {
  if (!record(value) || value.versao !== 2 || !text(value.regraFingerprint)
    || !Number.isInteger(value.quantidadeMaxima) || Number(value.quantidadeMaxima) < 1
    || (value.maxCiclos !== 1 && value.maxCiclos !== 2)
    || Number(value.quantidadeMaxima) > 60 || !record(value.financeiro) || !record(value.regra)) {
    throw new Error('O servidor não retornou o plano financeiro da transferência.');
  }
  const plan = value.financeiro;
  const rule = value.regra;
  if (![1, 2].includes(Number(plan.cicloNumero)) || typeof plan.cicloNumero !== 'number'
    || plan.cicloNumero > value.maxCiclos
    || !Number.isInteger(plan.quantidadeParcelas) || Number(plan.quantidadeParcelas) < 1
    || Number(plan.quantidadeParcelas) > Number(value.quantidadeMaxima)
    || !isTransferDate(plan.primeiroVencimento)
    || (plan.cicloNumero === 2 ? !text(plan.justificativaCiclo2) : plan.justificativaCiclo2 !== null)
    || typeof plan.cobrarMensalidades !== 'boolean' || !isExternalTransferConditions(plan.condicoes)
    || (plan.cobrarMensalidades && record(plan.condicoes) && Number(plan.condicoes.valorMensalidade) <= 0)
    || !record(value.totais) || !decimal(value.totais.cicloInicialNominal) || !decimal(value.totais.totalNominal)
    || !decimal(rule.valorMatricula) || !decimal(rule.valorMensalidade) || !decimal(rule.valorRematricula)
    || !record(rule.encargos) || !decimal(rule.encargos.descontoPontualidade)
    || !decimal(rule.encargos.jurosAtrasoPercentual) || !decimal(rule.encargos.multaAtrasoPercentual)
    || !record(rule.aplicacao) || !application(rule.aplicacao.matricula)
    || !application(rule.aplicacao.mensalidade) || !application(rule.aplicacao.rematricula)
    || !Array.isArray(value.avisos) || !value.avisos.every(text)) {
    throw new Error('O plano financeiro retornado está incompleto. Refaça a conferência.');
  }
  return value as unknown as ExternalTransferPreview;
};

export const requireExternalTransferResult = (value: unknown, requestId: string): ExternalTransferResult => {
  if (!record(value) || value.versao !== 2 || value.requestId !== requestId
    || typeof value.replayed !== 'boolean' || !text(value.matriculaId) || !text(value.transferenciaId)
    || value.cobrancaGerada !== false) {
    throw new Error('Não foi possível confirmar o resultado do recebimento. Repita a mesma operação.');
  }
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
