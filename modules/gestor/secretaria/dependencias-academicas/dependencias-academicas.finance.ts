const finiteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
}

const dependencyPolicyFingerprint = (
  payload: DependencyPolicyPayload,
) => [
  payload.poloId,
  payload.disciplinaId,
  payload.multiplicadorParcela.toFixed(4),
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
