import type { BaneseFinancialTermsInput } from "../banese/internal/financial-terms.ts";
import type { GatewayChargeResult } from "../gateways/router.ts";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FINGERPRINT_RE = /^[0-9a-f]{64}$/;
export type ActivationRequest = {
  agreementId: string;
  requestId: string;
  expectedVersion: number;
  expectedFingerprint: string;
  confirm: true;
  /** Explicit consent only; financial authorization is always rechecked by SQL. */
  approveCustomTerms?: boolean;
};
export type ActivationProgress = {
  sourcesTotal: number;
  sourcesCanceled: number;
  replacementsTotal: number;
  replacementsIssued: number;
};
export type BankSnapshot = {
  provider: "banese_card";
  environment: "production";
  paymentMethod: "BOLETO";
  convenio: string;
  nossoNumero: string;
  amount: number;
  dueDate: string;
  agency: string;
  account: string;
  documentNumber: string;
  companyTitleId: string;
  payerDocument: string;
  digitableLine: string;
  barcode: string;
  financialTerms: BaneseFinancialTermsInput;
};
export type ActivationSource = {
  receivableId: string;
  kind: "BANESE" | "LOCAL";
  state: "PENDING" | "CANCEL_INTENT" | "CANCELED_CONFIRMED";
  attemptKey: string;
  sourceFingerprint: string;
  bankSnapshot: BankSnapshot | null;
};
export type ActivationReplacement = {
  receivableId: string;
  state: "PENDING" | "ISSUANCE_INTENT" | "ISSUED";
  attemptKey: string;
  financialTerms: BaneseFinancialTermsInput;
};
export type ActivationContext = {
  operationId: string;
  agreementId: string;
  requestId: string;
  state: "CANCELING_SOURCES" | "ISSUING_REPLACEMENTS" | "ACTIVE" | "REVIEW_REQUIRED";
  leaseToken: string;
  identity: { alunoId: string; matriculaId: string; turmaId: string; poloId: string };
  /** Private worker-only tax identity captured before any financial mutation. */
  payerDocument: string;
  courseType: "TECNICO" | "LIVRE" | "ESPECIALIZACAO";
  sources: ActivationSource[];
  replacements: ActivationReplacement[];
  replacementPlan: Array<{ sequence: number; kind: "DOWN_PAYMENT" | "INSTALLMENT";
    dueDate: string; amountCents: number; financialTerms: BaneseFinancialTermsInput;
    collectionPolicy: { daysAfterDue: 60; instruction: string } }>;
  runtime: { routeId: string; credentialId: string; issuerPoloId: string; environment: "production";
    convenio: string; agency: string; account: string; metadata: Record<string, unknown>;
    metadataFingerprint: string };
  /** Invocation-local deadline; never supplied by the HTTP caller or stored as policy. */
  deadlineAt?: number;
};
export type CancellationEvidence = {
  kind: "BANESE" | "LOCAL";
  situationCode: 5 | null;
  paymentsVerified: boolean;
  paymentCount: 0;
  identityVerified: boolean;
  evidenceFingerprint: string;
  confirmedAt: string;
};
export type ActivationResponse = ActivationProgress & {
  success: boolean;
  agreementId: string;
  operationId: string;
  requestId: string;
  state: ActivationContext["state"];
  retryable: boolean;
  code: string | null;
  message: string;
};
export class ActivationError extends Error {
  constructor(readonly code: string, message: string, readonly retryable = false, readonly status = 409) {
    super(message);
    this.name = "ActivationError";
  }
}
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};

export const parseActivationRequest = (value: unknown): ActivationRequest => {
  const body = record(value);
  if (Object.keys(body).some((key) => ![
    "agreementId", "requestId", "expectedVersion", "expectedFingerprint", "confirm", "approveCustomTerms",
  ].includes(key)) || body.confirm !== true ||
    (body.approveCustomTerms !== undefined && typeof body.approveCustomTerms !== "boolean") ||
    typeof body.agreementId !== "string" || !UUID_RE.test(body.agreementId) ||
    typeof body.requestId !== "string" || !UUID_RE.test(body.requestId) ||
    !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1 ||
    typeof body.expectedFingerprint !== "string" || !FINGERPRINT_RE.test(body.expectedFingerprint)) {
    throw new ActivationError("INVALID_REQUEST", "Confirmação de renegociação inválida.", false, 400);
  }
  return body as ActivationRequest;
};

export const progressOf = (context: ActivationContext): ActivationProgress => ({
  sourcesTotal: context.sources.length,
  sourcesCanceled: context.sources.filter((item) => item.state === "CANCELED_CONFIRMED").length,
  replacementsTotal: context.replacementPlan.length,
  replacementsIssued: context.replacements.filter((item) => item.state === "ISSUED").length,
});

export type ActivationDependencies = {
  start: (request: ActivationRequest) => Promise<{ operationId: string }>;
  claim: (operationId: string) => Promise<ActivationContext>;
  preflight: (context: ActivationContext) => Promise<void>;
  markCancelIntent: (context: ActivationContext, source: ActivationSource) => Promise<void>;
  cancelSource: (context: ActivationContext, source: ActivationSource,
    beforeMutation: () => Promise<void>) => Promise<CancellationEvidence>;
  confirmSource: (context: ActivationContext, source: ActivationSource, evidence: CancellationEvidence) => Promise<void>;
  prepareReplacements: (context: ActivationContext) => Promise<ActivationContext>;
  issueReplacement: (context: ActivationContext, item: ActivationReplacement) => Promise<GatewayChargeResult>;
  confirmReplacement: (context: ActivationContext, item: ActivationReplacement, result: GatewayChargeResult) => Promise<void>;
  finish: (context: ActivationContext) => Promise<void>;
  release: (context: ActivationContext) => Promise<void>;
  fail: (context: ActivationContext, error: ActivationError) => Promise<void>;
  now?: () => number;
};
