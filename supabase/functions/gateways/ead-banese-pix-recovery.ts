import { classifyBaneseReconciliationError } from "../banese-reconciliation-worker/error-classification.ts";
import { recoverBanesePixOnly } from "./api/banese-pix-only-recovery.ts";

const EAD_MODALITY = "EAD";
const BANESE_PROVIDER = "banese_card";
const BOLETO_METHOD = "BOLETO";
const PRODUCTION_ENVIRONMENT = "production";
const REVIEW_REQUIRED_PREFIX = "BANESE_EAD_PIX_REVIEW_REQUIRED:";
const PAYABLE_STATUSES = new Set([
  "PENDENTE",
  "VENCIDO",
  "AGUARDANDO_CONFIRMACAO",
]);
const RETRYABLE_ERROR_CLASSES = new Set([
  "RATE_LIMIT",
  "UPSTREAM_5XX",
  "TIMEOUT",
  "NETWORK",
]);

export const EAD_BANESE_PIX_RETRY_COOLDOWN_MS = 60_000;
const EAD_BANESE_PIX_RETRY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

type RecoveryDependencies = {
  now?: () => number;
  claim?: typeof claimEadBanesePixRetry;
  recoverPix?: typeof recoverBanesePixOnly;
  markReview?: typeof markEadBanesePixReviewRequired;
  logFailure?: (context: {
    receivableId: string;
    diagnosticCode: string;
    retryable: boolean;
  }) => void;
};

const normalizedUpper = (value: unknown) =>
  String(value ?? "").trim().toUpperCase();

const onlyDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

const targetedRecoveryPreflight = (input: {
  courseModality: unknown;
  receivable: Record<string, any> | null | undefined;
}) => {
  const receivable = input.receivable;
  if (
    !receivable ||
    normalizedUpper(input.courseModality) !== EAD_MODALITY ||
    receivable.gateway_provider !== BANESE_PROVIDER ||
    normalizedUpper(receivable.gateway_payment_method) !== BOLETO_METHOD ||
    String(receivable.gateway_environment ?? "").trim().toLowerCase() !==
      PRODUCTION_ENVIRONMENT ||
    !PAYABLE_STATUSES.has(normalizedUpper(receivable.status)) ||
    receivable.data_pagamento
  ) {
    return { eligible: false, reviewDiagnosticCode: null as string | null };
  }
  if (
    String(receivable.gateway_last_error ?? "").startsWith(
      REVIEW_REQUIRED_PREFIX,
    )
  ) {
    return { eligible: false, reviewDiagnosticCode: null as string | null };
  }

  const pixPayload = String(receivable.gateway_pix_payload ?? "").trim();
  const pixImage = String(receivable.gateway_pix_encoded_image ?? "").trim();
  if (pixPayload && pixImage) {
    return { eligible: false, reviewDiagnosticCode: null as string | null };
  }
  if (Boolean(pixPayload) !== Boolean(pixImage)) {
    return {
      eligible: false,
      reviewDiagnosticCode: "PIX_SNAPSHOT_INCOMPLETE",
    };
  }
  if (!/^\d{9}$/.test(onlyDigits(receivable.gateway_boleto_nosso_numero))) {
    return {
      eligible: false,
      reviewDiagnosticCode: "LOCAL_TITLE_NUMBER_INVALID",
    };
  }
  if (
    onlyDigits(receivable.gateway_boleto_linha_digitavel).length !== 47 ||
    onlyDigits(receivable.gateway_boleto_codigo_barras).length !== 44 ||
    !onlyDigits(receivable.gateway_boleto_convenio)
  ) {
    return {
      eligible: false,
      reviewDiagnosticCode: "LOCAL_BANK_NUMBERS_INVALID",
    };
  }
  if (
    !receivable.gateway_financial_terms ||
    typeof receivable.gateway_financial_terms !== "object" ||
    !receivable.gateway_financial_terms_confirmed_at
  ) {
    return {
      eligible: false,
      reviewDiagnosticCode: "LOCAL_FINANCIAL_TERMS_MISSING",
    };
  }
  return { eligible: true, reviewDiagnosticCode: null as string | null };
};

const retryCooldownForAge = (ageMs: number) => {
  if (ageMs < 6 * 60 * 60 * 1_000) {
    return EAD_BANESE_PIX_RETRY_COOLDOWN_MS;
  }
  if (ageMs < 24 * 60 * 60 * 1_000) return 5 * 60 * 1_000;
  return 60 * 60 * 1_000;
};

export const eadBanesePixRetryPolicy = (input: {
  courseModality: unknown;
  receivable: Record<string, any> | null | undefined;
  nowMs?: number;
  cooldownMs?: number;
}) => {
  const preflight = targetedRecoveryPreflight(input);
  if (!preflight.eligible) {
    return {
      shouldAttempt: false,
      reviewDiagnosticCode: preflight.reviewDiagnosticCode,
    };
  }

  const receivable = input.receivable!;
  const nowMs = input.nowMs ?? Date.now();
  const issuedAt = Date.parse(
    String(
      receivable.gateway_boleto_issued_at ?? receivable.created_at ?? "",
    ),
  );
  if (!Number.isFinite(issuedAt)) {
    return {
      shouldAttempt: false,
      reviewDiagnosticCode: "LOCAL_ISSUED_AT_MISSING",
    };
  }
  const ageMs = Math.max(0, nowMs - issuedAt);
  if (ageMs >= EAD_BANESE_PIX_RETRY_MAX_AGE_MS) {
    return {
      shouldAttempt: false,
      reviewDiagnosticCode: "RETRY_WINDOW_EXPIRED",
    };
  }

  const syncedAt = Date.parse(String(receivable.gateway_synced_at ?? ""));
  const cooldownMs = input.cooldownMs ?? retryCooldownForAge(ageMs);
  return {
    shouldAttempt: !Number.isFinite(syncedAt) ||
      nowMs - syncedAt >= cooldownMs,
    reviewDiagnosticCode: null as string | null,
  };
};

export const shouldRetryMissingEadBanesePix = (input: {
  courseModality: unknown;
  receivable: Record<string, any> | null | undefined;
  nowMs?: number;
  cooldownMs?: number;
}) => eadBanesePixRetryPolicy(input).shouldAttempt;

const applyExactNullableFilter = (
  query: any,
  field: string,
  value: unknown,
) =>
  value === null || value === undefined
    ? query.is(field, null)
    : query.eq(field, value);

export const claimEadBanesePixRetry = async (
  admin: any,
  input: {
    receivable: Record<string, any>;
    attemptedAt: string;
  },
) => {
  const receivable = input.receivable;
  let query = admin
    .from("contas_receber")
    .update({
      gateway_synced_at: input.attemptedAt,
      updated_at: input.attemptedAt,
    })
    .eq("id", receivable.id)
    .eq("gateway_provider", BANESE_PROVIDER)
    .eq("gateway_environment", PRODUCTION_ENVIRONMENT)
    .eq("gateway_payment_method", BOLETO_METHOD)
    .eq("status", receivable.status);
  for (
    const [field, value] of [
      ["data_pagamento", receivable.data_pagamento],
      ["gateway_pix_payload", receivable.gateway_pix_payload],
      ["gateway_pix_encoded_image", receivable.gateway_pix_encoded_image],
      ["gateway_synced_at", receivable.gateway_synced_at],
      ["updated_at", receivable.updated_at],
    ]
  ) {
    query = applyExactNullableFilter(query, String(field), value);
  }
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  return String(data?.id ?? "") === String(receivable.id ?? "");
};

const safeDiagnosticCode = (value: unknown) => {
  const code = String(value ?? "REVIEW_REQUIRED").toUpperCase();
  return /^[A-Z0-9_]{1,80}$/.test(code) ? code : "REVIEW_REQUIRED";
};

export const markEadBanesePixReviewRequired = async (
  admin: any,
  input: {
    receivable: Record<string, any>;
    diagnosticCode: string;
    markedAt: string;
  },
) => {
  const receivable = input.receivable;
  let query = admin
    .from("contas_receber")
    .update({
      gateway_last_error: `${REVIEW_REQUIRED_PREFIX}${
        safeDiagnosticCode(input.diagnosticCode)
      }`,
      updated_at: input.markedAt,
    })
    .eq("id", receivable.id)
    .eq("gateway_provider", BANESE_PROVIDER)
    .eq("gateway_environment", PRODUCTION_ENVIRONMENT)
    .eq("gateway_payment_method", BOLETO_METHOD)
    .eq("status", receivable.status);
  for (
    const [field, value] of [
      ["data_pagamento", receivable.data_pagamento],
      ["gateway_pix_payload", receivable.gateway_pix_payload],
      ["gateway_pix_encoded_image", receivable.gateway_pix_encoded_image],
      ["gateway_synced_at", receivable.gateway_synced_at],
      ["updated_at", receivable.updated_at],
    ]
  ) {
    query = applyExactNullableFilter(query, String(field), value);
  }
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  return String(data?.id ?? "") === String(receivable.id ?? "");
};

export const recoverMissingEadBanesePix = async (
  admin: any,
  input: {
    courseModality: unknown;
    receivable: Record<string, any>;
  },
  dependencies: RecoveryDependencies = {},
) => {
  const now = dependencies.now ?? Date.now;
  const nowMs = now();
  const policy = eadBanesePixRetryPolicy({ ...input, nowMs });
  const receivableId = String(input.receivable.id ?? "");
  if (policy.reviewDiagnosticCode) {
    try {
      await (dependencies.markReview ?? markEadBanesePixReviewRequired)(
        admin,
        {
          receivable: input.receivable,
          diagnosticCode: policy.reviewDiagnosticCode,
          markedAt: new Date(nowMs).toISOString(),
        },
      );
    } catch {
      // A releitura preservará qualquer mutação concorrente mais recente.
    }
    return {
      receivable: input.receivable,
      attempted: false,
      recovered: false,
      refreshRecommended: true,
      reviewRequired: true,
    };
  }
  if (!policy.shouldAttempt) {
    return {
      receivable: input.receivable,
      attempted: false,
      recovered: false,
      refreshRecommended: false,
      reviewRequired: false,
    };
  }

  const attemptedAt = new Date(nowMs).toISOString();
  try {
    const claimed = await (dependencies.claim ?? claimEadBanesePixRetry)(
      admin,
      { receivable: input.receivable, attemptedAt },
    );
    if (!claimed) {
      return {
        receivable: input.receivable,
        attempted: false,
        recovered: false,
        refreshRecommended: true,
        reviewRequired: false,
      };
    }

    const result = await (dependencies.recoverPix ?? recoverBanesePixOnly)(
      admin,
      receivableId,
    );
    const recoveredReceivable = result?.receivable;
    if (
      !recoveredReceivable ||
      String(recoveredReceivable.id ?? "") !== receivableId
    ) {
      throw new Error("Recuperacao BolePix retornou recebivel inesperado.");
    }
    const receivable: Record<string, any> = {
      ...input.receivable,
      ...recoveredReceivable,
      turmas: input.receivable.turmas,
    };
    const recovered = Boolean(
      String(receivable.gateway_pix_payload ?? "").trim() &&
        String(receivable.gateway_pix_encoded_image ?? "").trim(),
    );
    return {
      receivable,
      attempted: true,
      recovered,
      refreshRecommended: true,
      reviewRequired: false,
    };
  } catch (error) {
    const classification = classifyBaneseReconciliationError(error);
    const retryable = RETRYABLE_ERROR_CLASSES.has(classification.errorClass) ||
      (classification.errorClass === "QUERY_ERROR" &&
        classification.httpStatus === null) ||
      classification.diagnosticCode === "LOCAL_CONCURRENCY_CONFLICT";
    if (!retryable) {
      try {
        await (dependencies.markReview ?? markEadBanesePixReviewRequired)(
          admin,
          {
            receivable: {
              ...input.receivable,
              gateway_synced_at: attemptedAt,
              updated_at: attemptedAt,
            },
            diagnosticCode: classification.diagnosticCode,
            markedAt: new Date(now()).toISOString(),
          },
        );
      } catch {
        // O diagnóstico seguro segue no log mesmo se o CAS perder a corrida.
      }
    }
    (dependencies.logFailure ??
      ((context) => console.warn("banese_ead_pix_retry_failed", context)))({
        receivableId,
        diagnosticCode: classification.diagnosticCode,
        retryable,
      });
    return {
      receivable: input.receivable,
      attempted: true,
      recovered: false,
      refreshRecommended: true,
      reviewRequired: !retryable,
    };
  }
};
