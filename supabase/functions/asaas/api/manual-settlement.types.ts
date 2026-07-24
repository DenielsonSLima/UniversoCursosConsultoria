import type { GestorAutorizado } from "./authz.ts";

export type ManualSettlementPaymentMethod =
  | "BOLETO"
  | "PIX"
  | "CARTAO"
  | "DINHEIRO";

export type ManualSettlementState =
  | "STARTED"
  | "REMOTE_CANCELED_LOCAL_PENDING"
  | "FAILED_SAFE"
  | "REVIEW_REQUIRED"
  | "COMPLETED"
  | "REVERSED";

export interface ManualSettlementBreakdown {
  currency: "BRL";
  principalCents: number;
  interestCents: number;
  penaltyCents: number;
  additionCents: number;
  discountCents: number;
  receivedCents: number;
}

export interface NormalizedManualSettlementRequest {
  receivableId: string;
  idempotencyKey: string;
  accountId: string;
  paymentDate: string;
  paymentMethod: ManualSettlementPaymentMethod;
  breakdown: ManualSettlementBreakdown;
}

export interface ManualSettlementAttempt {
  id: string;
  idempotency_key: string;
  request_fingerprint: string;
  receivable_id: string;
  actor_id: string;
  polo_id: string | null;
  account_id: string;
  payment_date: string;
  payment_method: ManualSettlementPaymentMethod;
  principal_cents: number;
  interest_cents: number;
  penalty_cents: number;
  addition_cents: number;
  discount_cents: number;
  received_cents: number;
  provider_code: string | null;
  environment: "sandbox" | "production" | null;
  remote_payment_id: string | null;
  remote_payment_link_id: string | null;
  requires_remote_cancellation: boolean;
  remote_canceled_at: string | null;
  receivable_snapshot: Record<string, unknown>;
  state: ManualSettlementState;
  lease_token: string | null;
  lease_expires_at: string | null;
  review_required_at: string | null;
  completed_at: string | null;
  reversed_at: string | null;
  last_error: string | null;
  result: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ManualSettlementResult {
  success: true;
  settlementId: string;
  replayed?: boolean;
  asaasCanceled?: boolean;
  asaasPaymentLinkCanceled?: boolean;
  asaasPaymentId?: string | null;
  baneseCanceled?: boolean;
  gatewayCanceled?: boolean;
  gatewayProvider?: string | null;
  gatewayPaymentId?: string | null;
  academicSyncCompleted?: boolean;
  academicSyncWarning?: string | null;
  futureSyncWarning?: string | null;
  breakdown?: ManualSettlementBreakdown;
}

export interface AsaasRuntime {
  environment: "sandbox" | "production";
  baseUrl: string;
  apiKey: string;
}

export interface ManualSettlementServiceDependencies {
  admin: any;
  actor: GestorAutorizado;
  body: Record<string, unknown>;
  requirePoloAccess: (actor: GestorAutorizado, poloId: string | null) => void;
  getAsaasRuntime: (receivable: any) => Promise<AsaasRuntime>;
  syncFutureInstallments?: (
    matriculaId: string,
  ) => Promise<{ skipped?: boolean; reason?: string | null } | void>;
  syncOnlineInscriptionPayment?: (
    context: { admin: any },
    input: {
      receivable: any;
      gatewayProvider: string;
      environment: string;
      paymentId: string | null;
      paymentLinkId: string | null;
      localStatus: string | null;
      legacyPaymentMethod: string;
      pendingStatus: string;
    },
  ) => Promise<unknown>;
  activateEnrollmentAfterPayment?: (
    context: { admin: any },
    receivable: any,
  ) => Promise<void>;
  fetcher?: typeof fetch;
  now?: () => Date;
  leaseToken?: () => string;
  cancelBanese?: (admin: any, receivable: any) => Promise<{
    receivable: any;
    remotePaymentId: string;
    remoteStatus: string;
    alreadyCanceled: boolean;
  }>;
  repository?: ManualSettlementRepository;
}

export interface ManualSettlementRepository {
  getReceivable(id: string): Promise<any>;
  getAttemptByIdempotencyKey(
    key: string,
  ): Promise<ManualSettlementAttempt | null>;
  getActiveAttempt(
    receivableId: string,
  ): Promise<ManualSettlementAttempt | null>;
  createAttempt(
    input: Record<string, unknown>,
  ): Promise<ManualSettlementAttempt>;
  claimAttempt(
    attempt: ManualSettlementAttempt,
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<ManualSettlementAttempt | null>;
  markRemoteReady(
    attemptId: string,
    leaseToken: string,
    input: Record<string, unknown>,
  ): Promise<ManualSettlementAttempt>;
  markReviewRequired(
    attemptId: string,
    leaseToken: string,
    error: string,
  ): Promise<void>;
  markSafeFailure(
    attemptId: string,
    leaseToken: string,
    error: string,
  ): Promise<void>;
  appendEvent(
    settlementId: string,
    actorId: string,
    eventType: string,
    details?: Record<string, unknown>,
  ): Promise<void>;
  finalize(
    attemptId: string,
    leaseToken: string,
  ): Promise<ManualSettlementResult>;
  updateCompletedResult(
    attemptId: string,
    result: ManualSettlementResult,
  ): Promise<void>;
  setFutureSyncError(matriculaId: string, message: string): Promise<void>;
}
