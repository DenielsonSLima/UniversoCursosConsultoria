import { roundMoney } from "./money.ts";

export type EnrollmentFinancialTerms = {
  discountValue: number;
  interestPercent: number;
  fineValue: number;
};

const isConfigured = (value: unknown) => value !== null && value !== undefined;

const parseConfiguredNumber = (
  value: unknown,
  label: string,
  options: { money?: boolean; max?: number } = {},
) => {
  if (
    (typeof value === "string" && value.trim() === "") ||
    (typeof value !== "string" && typeof value !== "number")
  ) {
    throw new Error(`${label} possui configuracao invalida.`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} possui configuracao invalida.`);
  }
  if (options.max !== undefined && parsed > options.max) {
    throw new Error(`${label} excede o limite permitido de ${options.max}.`);
  }

  return options.money ? roundMoney(parsed) : parsed;
};

const firstConfigured = (values: unknown[]) => {
  for (const value of values) {
    if (isConfigured(value)) return value;
  }
  return null;
};

/**
 * Resolve o valor da cobranca inicial sem tratar zero como ausencia.
 *
 * Um zero explicito interrompe a cadeia de fallback e resulta em erro. Assim,
 * uma matricula/turma configurada como gratuita nunca herda silenciosamente
 * outro preco e gera um titulo bancario por engano.
 */
export const resolveInitialEnrollmentChargeValue = (input: {
  course: any;
  turma: any;
  matricula?: any;
}) => {
  const configuredValue = firstConfigured([
    input.matricula?.valor_matricula_individual,
    input.turma?.valor_matricula,
    input.course?.valor,
    input.turma?.valor_parcela,
  ]);

  if (configuredValue === null) {
    throw new Error("Valor da matricula ainda nao configurado para cobranca.");
  }

  const value = parseConfiguredNumber(
    configuredValue,
    "Valor da matricula",
    { money: true },
  );
  if (value <= 0) {
    throw new Error(
      "Valor da matricula foi configurado como zero e nao pode gerar titulo bancario.",
    );
  }
  return value;
};

/**
 * Overrides individuais usam null/undefined para herdar da turma. Zero e um
 * valor valido e, portanto, desativa explicitamente o encargo correspondente.
 */
export const resolveEnrollmentFinancialTerms = (input: {
  turma: any;
  matricula?: any;
}): EnrollmentFinancialTerms => ({
  discountValue: parseConfiguredNumber(
    firstConfigured([
      input.matricula?.desconto_pontualidade_individual,
      input.turma?.desconto_pontualidade,
      0,
    ]),
    "Desconto de pontualidade",
    { money: true },
  ),
  interestPercent: parseConfiguredNumber(
    firstConfigured([
      input.matricula?.juros_atraso_individual,
      input.turma?.juros_atraso,
      0,
    ]),
    "Juros de atraso",
    { max: 100 },
  ),
  fineValue: parseConfiguredNumber(
    firstConfigured([
      input.matricula?.multa_atraso_individual,
      input.turma?.multa_atraso,
      0,
    ]),
    "Multa de atraso",
    { money: true },
  ),
});
