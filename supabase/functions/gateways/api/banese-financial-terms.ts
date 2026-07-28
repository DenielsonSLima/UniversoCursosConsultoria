import type {
  BaneseFinancialTermsInput,
} from "../../banese/internal/financial-terms.ts";

const roundMoney = (value: unknown) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const positiveNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const launchPolicy = (receivable: any, turma: any) => {
  const launchType = String(receivable?.tipo_lancamento || "").toUpperCase();
  if (launchType === "MATRICULA") {
    return {
      discount: turma?.aplicar_desconto_matricula === true,
      penalty: turma?.aplicar_multa_juros_matricula !== false,
    };
  }
  if (launchType === "REMATRICULA") {
    return {
      discount: turma?.aplicar_desconto_rematricula !== false,
      penalty: turma?.aplicar_multa_juros_rematricula !== false,
    };
  }
  return {
    discount: turma?.aplicar_desconto_mensalidade !== false,
    penalty: turma?.aplicar_multa_juros_mensalidade !== false,
  };
};

export const buildConfiguredBaneseFinancialTerms = (input: {
  receivable: any;
  turma?: any;
  matricula?: any;
}): BaneseFinancialTermsInput => {
  const { receivable, turma, matricula } = input;
  const nominalAmount = roundMoney(receivable?.valor);
  const dueDate = String(receivable?.data_vencimento || "").slice(0, 10);
  const policy = launchPolicy(receivable, turma);
  const discountValue = roundMoney(
    matricula?.desconto_pontualidade_individual ??
      turma?.desconto_pontualidade,
  );
  const interestValue = positiveNumber(
    matricula?.juros_atraso_individual ?? turma?.juros_atraso,
  );
  const percentagePenaltySource =
    matricula?.multa_atraso_percentual_individual ??
      turma?.multa_atraso_percentual;
  const hasPercentagePenalty = percentagePenaltySource !== null &&
    percentagePenaltySource !== undefined;
  const percentagePenaltyValue = positiveNumber(percentagePenaltySource);
  const fixedPenaltyValue = roundMoney(
    matricula?.multa_atraso_individual ?? turma?.multa_atraso,
  );

  return {
    nominalAmount,
    dueDate,
    discount: policy.discount && discountValue > 0 &&
        discountValue < nominalAmount
      ? { type: "fixed", value: discountValue }
      : null,
    interest: policy.penalty && interestValue > 0
      ? { type: "monthly-percentage", value: interestValue }
      : null,
    penalty: policy.penalty
      ? hasPercentagePenalty
        ? percentagePenaltyValue > 0
          ? { type: "percentage", value: percentagePenaltyValue }
          : null
        : fixedPenaltyValue > 0
        ? { type: "fixed", value: fixedPenaltyValue }
        : null
      : null,
  };
};

export const resolveBaneseReceivableFinancialTerms = async (
  admin: any,
  receivable: any,
): Promise<BaneseFinancialTermsInput> => {
  const { data: turma, error: turmaError } = receivable?.turma_id
    ? await admin
      .from("turmas")
      .select(
        "desconto_pontualidade, juros_atraso, multa_atraso, multa_atraso_percentual, aplicar_desconto_matricula, aplicar_multa_juros_matricula, aplicar_desconto_mensalidade, aplicar_multa_juros_mensalidade, aplicar_desconto_rematricula, aplicar_multa_juros_rematricula",
      )
      .eq("id", receivable.turma_id)
      .maybeSingle()
    : { data: null, error: null };
  if (turmaError) throw turmaError;

  const { data: matricula, error: matriculaError } = receivable?.matricula_id
    ? await admin
      .from("matriculas")
      .select(
        "desconto_pontualidade_individual, juros_atraso_individual, multa_atraso_individual, multa_atraso_percentual_individual",
      )
      .eq("id", receivable.matricula_id)
      .maybeSingle()
    : { data: null, error: null };
  if (matriculaError) throw matriculaError;

  return buildConfiguredBaneseFinancialTerms({
    receivable,
    turma,
    matricula,
  });
};

export const baneseFinancialTermsFromCharge = (input: {
  amount: unknown;
  dueDate: unknown;
  discount?: any;
  interest?: any;
  fine?: any;
}): BaneseFinancialTermsInput => {
  const nominalAmount = roundMoney(input.amount);
  const dueDate = String(input.dueDate || "").slice(0, 10);
  const discountValue = positiveNumber(input.discount?.value);
  const interestValue = positiveNumber(input.interest?.value);
  const fineValue = positiveNumber(input.fine?.value);
  const discountType = String(input.discount?.type || "FIXED").toUpperCase();
  const fineType = String(input.fine?.type || "FIXED").toUpperCase();

  return {
    nominalAmount,
    dueDate,
    discount: discountValue > 0
      ? {
        type: discountType === "PERCENTAGE" ? "percentage" : "fixed",
        value: discountValue,
      }
      : null,
    interest: interestValue > 0
      ? { type: "monthly-percentage", value: interestValue }
      : null,
    penalty: fineValue > 0
      ? {
        type: fineType === "PERCENTAGE" ? "percentage" : "fixed",
        value: fineValue,
      }
      : null,
  };
};
