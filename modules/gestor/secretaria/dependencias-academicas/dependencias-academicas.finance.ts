const finiteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const DEPENDENCY_BILLING_DAYS_TO_WRITE_OFF = 60;

export const DEPENDENCY_BILLING_INSTRUCTION =
  'SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO.';

interface DependencyBillingPreviewContract {
  origin: unknown;
  description: unknown;
  discount: unknown;
  monthlyInterest: unknown;
  penalty: unknown;
  writeOffDays: unknown;
  instruction: unknown;
}

/**
 * Impede o cliente novo de confirmar usando uma resposta antiga/incompleta do
 * backend. Os valores podem ser zero, mas precisam vir explicitamente do
 * snapshot canônico da dependência.
 */
export const dependencyBillingPreviewContractError = (
  contract: DependencyBillingPreviewContract,
): string | null => {
  const origin = String(contract.origin ?? '').trim().toUpperCase();
  const description = String(contract.description ?? '').trim();
  const instruction = String(contract.instruction ?? '').trim();
  const discount = finiteNumber(contract.discount);
  const monthlyInterest = finiteNumber(contract.monthlyInterest);
  const penalty = finiteNumber(contract.penalty);
  const writeOffDays = finiteNumber(contract.writeOffDays);

  if (origin !== 'DEPENDENCIA') {
    return 'A prévia financeira da disciplina está desatualizada. Recarregue após atualizar o backend.';
  }
  if (!description.startsWith('Disciplina: ')) {
    return 'A descrição isolada da disciplina não foi confirmada pelo backend.';
  }
  if (
    discount === null
    || monthlyInterest === null
    || penalty === null
    || discount < 0
    || monthlyInterest < 0
    || penalty < 0
  ) {
    return 'Os encargos próprios da disciplina não foram confirmados pelo backend.';
  }
  if (writeOffDays !== DEPENDENCY_BILLING_DAYS_TO_WRITE_OFF) {
    return 'O prazo bancário de 60 dias não foi confirmado pelo backend.';
  }
  if (instruction !== DEPENDENCY_BILLING_INSTRUCTION) {
    return 'A instrução obrigatória do boleto não foi confirmada pelo backend.';
  }
  return null;
};

/**
 * O contrato atual do backend persiste e retorna o multiplicador da parcela:
 * 0,5 = 50%, 1 = 100%, 1,5 = 150% e 10 = 1000%.
 *
 * O nome legado `percentual` ainda aparece no RPC integrado, mas seu conteúdo
 * continua sendo o multiplicador. Centralizar a conversão evita heurísticas
 * ambíguas justamente quando o multiplicador passa de uma parcela.
 */
export const dependencyRulePercentage = (
  rule: Record<string, unknown>,
): number => {
  const multiplier = [
    rule.multiplicador,
    rule.multiplicador_parcela,
    rule.fator,
    rule.percentual,
    rule.percentual_parcela,
  ].map(finiteNumber).find((value) => value !== null);

  return multiplier === undefined ? 0 : multiplier * 100;
};

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export const hasCompleteDependencyBoleto = (boleto: {
  linhaDigitavel?: unknown;
  codigoBarras?: unknown;
  nossoNumero?: unknown;
}): boolean => (
  digits(boleto.linhaDigitavel).length === 47
  && digits(boleto.codigoBarras).length === 44
  && digits(boleto.nossoNumero).length > 0
);

export interface DependencyPolicyAttempt {
  fingerprint: string;
  idempotencyKey: string;
}

interface DependencyPolicyPayload {
  poloId: string;
  disciplinaId: string;
  multiplicadorParcela: number;
  descontoPontualidade: number;
  jurosAtrasoPercentual: number;
  multaAtrasoPercentual: number;
}

const dependencyPolicyFingerprint = (
  payload: DependencyPolicyPayload,
) => [
  payload.poloId,
  payload.disciplinaId,
  payload.multiplicadorParcela.toFixed(4),
  payload.descontoPontualidade.toFixed(2),
  payload.jurosAtrasoPercentual.toFixed(4),
  payload.multaAtrasoPercentual.toFixed(4),
].join(':');

/**
 * Conserva a chave após timeout/erro para que o mesmo clique lógico seja
 * realmente idempotente. Mudança de polo, disciplina ou percentual inicia
 * outra tentativa; sucesso é quem limpa a referência no componente.
 */
export const resolveDependencyPolicyAttempt = (
  current: DependencyPolicyAttempt | null,
  payload: DependencyPolicyPayload,
  createKey: () => string,
): DependencyPolicyAttempt => {
  const fingerprint = dependencyPolicyFingerprint(payload);
  if (current?.fingerprint === fingerprint) return current;
  return {
    fingerprint,
    idempotencyKey: createKey(),
  };
};
