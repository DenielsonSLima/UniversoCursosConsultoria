import {
  type BaneseFinancialTermsInput,
  normalizeBaneseFinancialTerms,
} from "../../banese/internal/financial-terms.ts";
import { assertBaneseFinancialTermsEqual } from "../../banese/internal/financial-terms-response.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
const text = (value: unknown) => String(value ?? "").trim();
const error = () =>
  new Error(
    "O carnê de Outros Créditos possui snapshot financeiro incompatível e exige conferência.",
  );

/** Only a plan's immutable snapshot may price its independent bank titles. */
export const buildOtherCreditPlanBaneseFinancialTerms = (
  receivable: Record<string, unknown>,
): BaneseFinancialTermsInput | null => {
  const raw = receivable.regra_financeira_outros_creditos_snapshot;
  const planId = text(receivable.outros_creditos_plano_id);
  if (!planId && raw == null) return null;
  const snapshot = record(raw);
  const role = text(receivable.outros_creditos_papel);
  const number = snapshot?.numero;
  const count = snapshot?.quantidadeParcelas;
  const terms = record(snapshot?.financialTerms);
  if (
    !UUID_RE.test(planId) || !snapshot || snapshot.versao !== 1 ||
    snapshot.origem !== "OUTROS_CREDITOS_PLANO" ||
    snapshot.planoId !== planId ||
    snapshot.papel !== role ||
    !["PARCELA", "MATRICULA", "REMATRICULA"].includes(role) ||
    !Number.isInteger(count) || Number(count) < 1 || Number(count) > 60 ||
    !Number.isInteger(number) ||
    (role === "PARCELA"
      ? Number(number) < 1 || Number(number) > Number(count)
      : number !== 0) ||
    text(receivable.categoria).toUpperCase() !== "OUTROS_CREDITOS" ||
    text(receivable.tipo_lancamento).toUpperCase() !== "OUTRO_CREDITO" ||
    receivable.matricula_id != null || receivable.turma_id != null ||
    receivable.origem_cronograma_id != null ||
    /PROESC|SISTEMA_ANTERIOR/.test(
      text(receivable.origem_pagamento).toUpperCase(),
    ) ||
    !terms || ["nominalAmount", "dueDate", "discount", "interest", "penalty"]
      .some((field) => !Object.prototype.hasOwnProperty.call(terms, field)) ||
    typeof terms.nominalAmount !== "number" ||
    terms.nominalAmount !== Number(receivable.valor) ||
    terms.dueDate !== text(receivable.data_vencimento).slice(0, 10) ||
    (role !== "PARCELA" && terms.discount !== null)
  ) throw error();
  try {
    const normalized = normalizeBaneseFinancialTerms(
      terms as BaneseFinancialTermsInput,
    );
    if (normalized.nominalAmount !== terms.nominalAmount) throw error();
    if (receivable.gateway_financial_terms_confirmed_at != null) {
      assertOtherCreditPlanConfirmedTerms(receivable, normalized);
    }
    return normalized;
  } catch {
    throw error();
  }
};

export const assertOtherCreditPlanConfirmedTerms = (
  receivable: Record<string, unknown>,
  expected: BaneseFinancialTermsInput,
) => {
  const confirmedAt = text(receivable.gateway_financial_terms_confirmed_at);
  const actual = record(receivable.gateway_financial_terms);
  if (!actual || !confirmedAt || Number.isNaN(Date.parse(confirmedAt))) {
    throw new Error(
      "Todas as parcelas precisam ter condições financeiras confirmadas pelo Banese.",
    );
  }
  try {
    return assertBaneseFinancialTermsEqual(
      expected,
      actual as BaneseFinancialTermsInput,
    );
  } catch {
    throw new Error(
      "As condições confirmadas pelo Banese divergem do plano de Outros Créditos.",
    );
  }
};
