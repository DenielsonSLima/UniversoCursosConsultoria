import {
  type BaneseFinancialTermsInput,
  normalizeBaneseFinancialTerms,
} from "../../banese/internal/financial-terms.ts";
import {
  dependencyBillingSnapshotFrom,
  isDependencyReceivable,
} from "../../banese/internal/dependency-billing.ts";

const roundMoney = (value: unknown) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const positiveNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const singlePlanSnapshot = (receivable: any) => {
  const snapshot = receivable?.regra_financeira_plano_unico_snapshot;
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) &&
      snapshot.origem === "PLANO_UNICO"
    ? snapshot
    : null;
};

const dependencyPlanSnapshot = (receivable: any) =>
  dependencyBillingSnapshotFrom(
    receivable?.regra_financeira_dependencia_snapshot,
  );

type TechnicalFinancialSnapshot = Record<string, unknown>;

const asRecord = (value: unknown): TechnicalFinancialSnapshot | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as TechnicalFinancialSnapshot
    : null;

const technicalSnapshotError = (detail: string) =>
  new Error(
    `Snapshot financeiro técnico inválido: ${detail}. Nenhum título Banese foi emitido.`,
  );

const requiredNonNegativeNumber = (
  snapshot: TechnicalFinancialSnapshot,
  field: string,
) => {
  const raw = snapshot[field];
  if (
    raw === null || raw === undefined || raw === "" ||
    typeof raw === "boolean"
  ) {
    throw technicalSnapshotError(`campo ${field} ausente`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw technicalSnapshotError(`campo ${field} fora do domínio`);
  }
  return value;
};

const requiredBoolean = (
  snapshot: TechnicalFinancialSnapshot,
  field: string,
) => {
  const value = snapshot[field];
  if (typeof value !== "boolean") {
    throw technicalSnapshotError(`campo ${field} ausente`);
  }
  return value;
};

const expectedTechnicalLaunchKind = (receivable: any) => {
  const launchType = String(receivable?.tipo_lancamento || "").toUpperCase();
  if (launchType === "MATRICULA") return "MATRICULA";
  if (launchType === "REMATRICULA") return "REMATRICULA";
  return "MENSALIDADE";
};

/**
 * O snapshot técnico é a política monetária imutável do recebível. A versão 1
 * preserva a multa fixa historicamente congelada; a versão 2 mantém também o
 * percentual original e prova que o valor monetário derivado corresponde ao
 * valor nominal deste título.
 */
export const buildTechnicalSnapshotBaneseFinancialTerms = (
  receivable: any,
): BaneseFinancialTermsInput | null => {
  const rawSnapshot = receivable?.regra_financeira_tecnica_snapshot;
  if (rawSnapshot === null || rawSnapshot === undefined) return null;
  const snapshot = asRecord(rawSnapshot);
  if (!snapshot) {
    throw technicalSnapshotError("conteúdo não é um objeto");
  }

  const version = Number(snapshot.versao);
  if (!Number.isInteger(version) || ![1, 2].includes(version)) {
    throw technicalSnapshotError("versão não suportada");
  }
  if (!String(snapshot.origem || "").trim()) {
    throw technicalSnapshotError("origem ausente");
  }
  const expectedKind = expectedTechnicalLaunchKind(receivable);
  if (String(snapshot.tipoLancamento || "").toUpperCase() !== expectedKind) {
    throw technicalSnapshotError("tipo de lançamento divergente");
  }
  if (
    snapshot.cicloManual !== undefined && !asRecord(snapshot.cicloManual)
  ) {
    throw technicalSnapshotError("identidade do ciclo manual inválida");
  }

  const nominalAmount = roundMoney(receivable?.valor);
  const snapshotAmount = roundMoney(
    requiredNonNegativeNumber(snapshot, "valorBase"),
  );
  if (nominalAmount <= 0 || snapshotAmount !== nominalAmount) {
    throw technicalSnapshotError("valor base diverge do recebível");
  }
  const dueDate = String(receivable?.data_vencimento || "").slice(0, 10);
  const discountValue = roundMoney(
    requiredNonNegativeNumber(snapshot, "descontoPontualidade"),
  );
  const interestValue = requiredNonNegativeNumber(
    snapshot,
    "jurosAtrasoPercentual",
  );
  if (interestValue >= 100) {
    throw technicalSnapshotError("juros percentuais fora do domínio");
  }
  const appliesDiscount = requiredBoolean(snapshot, "aplicarDesconto");
  const appliesPenalty = requiredBoolean(snapshot, "aplicarMultaJuros");
  if (appliesDiscount && discountValue >= nominalAmount && discountValue > 0) {
    throw technicalSnapshotError("desconto não é menor que o valor nominal");
  }

  let penalty: BaneseFinancialTermsInput["penalty"];
  if (version === 1) {
    const fixedPenaltyValue = roundMoney(
      requiredNonNegativeNumber(snapshot, "multaAtrasoValor"),
    );
    if (
      appliesPenalty && fixedPenaltyValue >= nominalAmount &&
      fixedPenaltyValue > 0
    ) {
      throw technicalSnapshotError(
        "multa fixa não é menor que o valor nominal",
      );
    }
    penalty = appliesPenalty && fixedPenaltyValue > 0
      ? { type: "fixed", value: fixedPenaltyValue }
      : null;
  } else {
    const percentagePenaltyValue = requiredNonNegativeNumber(
      snapshot,
      "multaAtrasoPercentual",
    );
    if (percentagePenaltyValue >= 100) {
      throw technicalSnapshotError("multa percentual fora do domínio");
    }
    const storedDerivedValue = roundMoney(
      requiredNonNegativeNumber(snapshot, "multaAtrasoValor"),
    );
    const expectedDerivedValue = roundMoney(
      nominalAmount * percentagePenaltyValue / 100,
    );
    if (storedDerivedValue !== expectedDerivedValue) {
      throw technicalSnapshotError("valor derivado da multa não confere");
    }
    penalty = appliesPenalty && percentagePenaltyValue > 0
      ? { type: "percentage", value: percentagePenaltyValue }
      : null;
  }

  return {
    nominalAmount,
    dueDate,
    discount: appliesDiscount && discountValue > 0
      ? { type: "fixed", value: discountValue }
      : null,
    interest: appliesPenalty && interestValue > 0
      ? { type: "monthly-percentage", value: interestValue }
      : null,
    penalty,
  };
};

const confirmedBaneseFinancialTerms = (
  receivable: any,
): BaneseFinancialTermsInput | null => {
  const confirmedAt = String(
    receivable?.gateway_financial_terms_confirmed_at || "",
  ).trim();
  if (!confirmedAt) return null;
  if (Number.isNaN(Date.parse(confirmedAt))) {
    throw new Error(
      "Snapshot financeiro Banese confirmado possui data inválida e exige conciliação.",
    );
  }
  const stored = asRecord(receivable?.gateway_financial_terms);
  if (!stored) {
    throw new Error(
      "Título Banese confirmado está sem snapshot financeiro e exige conciliação.",
    );
  }
  const nominalAmount = roundMoney(receivable?.valor);
  const dueDate = String(receivable?.data_vencimento || "").slice(0, 10);
  if (
    roundMoney(stored.nominalAmount) !== nominalAmount ||
    String(stored.dueDate || "").slice(0, 10) !== dueDate
  ) {
    throw new Error(
      "Snapshot financeiro Banese confirmado diverge do recebível e não pode ser reprecificado.",
    );
  }
  return normalizeBaneseFinancialTerms({
    ...stored,
    nominalAmount,
    dueDate,
  } as BaneseFinancialTermsInput);
};

/**
 * O ciclo técnico manual nunca pode ser reprecificado por um snapshot Banese
 * residual. Antes do POST, a política técnica v2 é obrigatória e qualquer
 * termo anteriormente confirmado precisa ser exatamente equivalente.
 */
export const strictTechnicalManualBaneseFinancialTerms = (
  receivable: any,
): BaneseFinancialTermsInput => {
  const snapshot = asRecord(
    receivable?.regra_financeira_tecnica_snapshot,
  );
  const cycle = asRecord(snapshot?.cicloManual);
  const identity = asRecord(snapshot?.identidade);
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const sha256 = /^[0-9a-f]{64}$/i;
  if (
    Number(snapshot?.versao) !== 2 || !identity || !cycle ||
    !uuid.test(String(cycle.requestId || "")) ||
    !Number.isInteger(Number(cycle.cicloNumero)) ||
    Number(cycle.cicloNumero) < 1 ||
    !sha256.test(String(cycle.regraFingerprint || "")) ||
    !sha256.test(String(cycle.politicaFingerprint || "")) ||
    !sha256.test(String(cycle.cronogramaFingerprint || ""))
  ) {
    throw technicalSnapshotError(
      "versão 2 e identidade completa do ciclo manual são obrigatórias",
    );
  }
  const technical = buildTechnicalSnapshotBaneseFinancialTerms(receivable);
  if (!technical) {
    throw technicalSnapshotError("snapshot obrigatório ausente");
  }
  const expected = normalizeBaneseFinancialTerms(technical);
  const confirmed = confirmedBaneseFinancialTerms(receivable);
  if (confirmed && JSON.stringify(confirmed) !== JSON.stringify(expected)) {
    throw new Error(
      "Termos Banese confirmados divergem do snapshot técnico; nenhum novo POST foi autorizado.",
    );
  }
  return expected;
};

/**
 * Dependência é uma cobrança avulsa e isolada: nunca herda desconto, juros ou
 * multa da turma de reoferta nem da matrícula de origem.
 */
export const buildDependencyBaneseFinancialTerms = (
  receivable: any,
): BaneseFinancialTermsInput => {
  const snapshot = dependencyPlanSnapshot(receivable);
  if (!snapshot) {
    throw new Error(
      "Cobrança de dependência sem snapshot financeiro canônico exige conciliação.",
    );
  }

  const nominalAmount = roundMoney(receivable?.valor);
  const dueDate = String(receivable?.data_vencimento || "").slice(0, 10);
  const discountValue = roundMoney(snapshot.descontoPontualidade);
  const interestValue = positiveNumber(snapshot.jurosAtrasoPercentual);
  const penaltyValue = positiveNumber(snapshot.multaAtrasoPercentual);
  const appliesDiscount = snapshot.aplicarDesconto !== false;
  const appliesPenalty = snapshot.aplicarMultaJuros !== false;

  if (appliesDiscount && discountValue >= nominalAmount && discountValue > 0) {
    throw new Error(
      "O desconto da cobrança de dependência deve ser menor que o valor da disciplina.",
    );
  }

  return {
    nominalAmount,
    dueDate,
    discount: appliesDiscount && discountValue > 0
      ? { type: "fixed", value: discountValue }
      : null,
    interest: appliesPenalty && interestValue > 0
      ? { type: "monthly-percentage", value: interestValue }
      : null,
    penalty: appliesPenalty && penaltyValue > 0
      ? { type: "percentage", value: penaltyValue }
      : null,
  };
};

const launchPolicy = (receivable: any, turma: any) => {
  if (singlePlanSnapshot(receivable)) {
    return { discount: true, penalty: true };
  }
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
  if (
    isDependencyReceivable(receivable) && dependencyPlanSnapshot(receivable)
  ) {
    return buildDependencyBaneseFinancialTerms(receivable);
  }
  const technicalSnapshotTerms = buildTechnicalSnapshotBaneseFinancialTerms(
    receivable,
  );
  if (technicalSnapshotTerms) return technicalSnapshotTerms;
  const plan = singlePlanSnapshot(receivable);
  const nominalAmount = roundMoney(receivable?.valor);
  const dueDate = String(receivable?.data_vencimento || "").slice(0, 10);
  const policy = launchPolicy(receivable, turma);
  const discountValue = roundMoney(
    plan?.descontoPontualidade ??
      matricula?.desconto_pontualidade_individual ??
      turma?.desconto_pontualidade,
  );
  const interestValue = positiveNumber(
    plan?.jurosAtrasoPercentual ??
      matricula?.juros_atraso_individual ?? turma?.juros_atraso,
  );
  const percentagePenaltySource = plan
    ? null
    : matricula?.multa_atraso_percentual_individual ??
      turma?.multa_atraso_percentual;
  const hasPercentagePenalty = percentagePenaltySource !== null &&
    percentagePenaltySource !== undefined;
  const percentagePenaltyValue = positiveNumber(percentagePenaltySource);
  const fixedPenaltyValue = roundMoney(
    plan?.multaAtraso ?? matricula?.multa_atraso_individual ??
      turma?.multa_atraso,
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
  const confirmedTerms = confirmedBaneseFinancialTerms(receivable);
  if (confirmedTerms) return confirmedTerms;
  if (
    isDependencyReceivable(receivable) && dependencyPlanSnapshot(receivable)
  ) {
    return buildDependencyBaneseFinancialTerms(receivable);
  }
  const technicalSnapshotTerms = buildTechnicalSnapshotBaneseFinancialTerms(
    receivable,
  );
  if (technicalSnapshotTerms) return technicalSnapshotTerms;

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
