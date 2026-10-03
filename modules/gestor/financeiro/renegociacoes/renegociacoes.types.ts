export type RenegociacaoView = 'A_NEGOCIAR' | 'EM_ANDAMENTO' | 'EM_ATRASO' | 'ENCERRADOS';

export type RenegociacaoLifecycleStatus = 'DRAFT' | 'PROPOSED' | 'CANCELED';

export interface RenegociacaoEligibility {
  eligible: boolean;
  code: string;
  reason: string;
}

export interface RenegociacaoCapabilities {
  listProposals: boolean;
  viewProposal: boolean;
  saveProposal: boolean;
  discardProposal: boolean;
  activate: false;
  cancelSourceTitles: false;
  issueReplacementTitles: false;
}

export type RenegociacaoReadiness =
  | { availability: 'NOT_APPLIED'; message: string }
  | {
      availability: 'AVAILABLE';
      version: number;
      applied: true;
      rulesReady: boolean;
      capabilities: RenegociacaoCapabilities;
      unavailableReasons: Record<string, string>;
      lifecycleStatuses: RenegociacaoLifecycleStatus[];
    };

export interface RenegociacaoIdentity {
  poloId: string;
  alunoId: string;
  matriculaId: string;
  turmaId: string;
}

export interface RenegociacaoCandidateGroup extends RenegociacaoIdentity {
  alunoNome: string;
  matriculaCodigo: string | null;
  turmaNome: string;
  policyKind: string;
  eligibleCount: number;
  blockedCount: number;
  overdueCount: number;
  futureCount: number;
  principalCents: number;
  accruedInterestCents: number;
  accruedPenaltyCents: number;
  grossDebtCents: number;
  oldestDueDate: string | null;
  nextDueDate: string | null;
}

export interface RenegociacaoPenalty {
  kind: 'PERCENTAGE' | 'FIXED_CENTS';
  basisPoints?: number;
  percent?: number;
  unit?: string;
  amountCents?: number;
}

export interface RenegociacaoPolicyDefaults {
  origin: string;
  punctualDiscount: { kind: 'FIXED_CENTS'; amountCents: number };
  monthlyInterest: { kind: 'MONTHLY_PERCENTAGE'; basisPoints: number; percent?: number; unit?: string };
  penalty: RenegociacaoPenalty;
}

export interface RenegociacaoCandidateItem {
  receivableId: string;
  number: number | null;
  label: string;
  dueDate: string;
  status: string;
  overdue: boolean;
  lateDays: number;
  principalCents: number | null;
  interestCents: number | null;
  penaltyCents: number | null;
  debtCents: number | null;
  policyKind: string;
  sourceSystem: string;
  eligibility: RenegociacaoEligibility;
}

export interface RenegociacaoCandidatePage {
  version: number;
  asOf: string;
  groups: RenegociacaoCandidateGroup[];
  totalGroups: number;
  page: number;
  pageSize: number;
}

export interface RenegociacaoCandidateItemsResult {
  version: number;
  asOf: string;
  identity: RenegociacaoIdentity;
  policyDefaults: RenegociacaoPolicyDefaults | null;
  items: RenegociacaoCandidateItem[];
}

export type RenegociacaoPenaltyOverride =
  | { kind: 'PERCENTAGE'; basisPoints: number }
  | { kind: 'FIXED_CENTS'; amountCents: number };

export interface RenegociacaoPolicyOverrides {
  punctualDiscountCents?: number;
  monthlyInterestBasisPoints?: number;
  penalty?: RenegociacaoPenaltyOverride;
  waivedInterestCents?: number;
  waivedPenaltyCents?: number;
}

export interface RenegociacaoTerms {
  commercialDiscountCents?: number;
  downPaymentCents?: number;
  installmentCount?: number;
  firstDueDate?: string;
}

export interface RenegociacaoScheduleEntry {
  sequence: number;
  dueDate: string;
  amountCents: number;
  kind: 'DOWN_PAYMENT' | 'INSTALLMENT';
}

export interface RenegociacaoSourceItem
  extends Omit<
    RenegociacaoCandidateItem,
    'label' | 'eligibility' | 'principalCents' | 'interestCents' | 'penaltyCents' | 'debtCents'
  > {
  principalCents: number;
  interestCents: number;
  penaltyCents: number;
  debtCents: number;
  position: number;
  openAmountCents: number;
  sourceFingerprint: string;
  sourcePolicySnapshot: Record<string, unknown>;
  releasedAt?: string | null;
}

export interface RenegociacaoPolicySnapshot {
  kind: string;
  defaults: RenegociacaoPolicyDefaults;
  effective: {
    punctualDiscount: { kind: 'FIXED_CENTS'; amountCents: number };
    monthlyInterest: { kind: 'MONTHLY_PERCENTAGE'; basisPoints: number; percent?: number; unit?: string };
    penalty: RenegociacaoPenalty;
  };
  provenance: {
    punctualDiscount: 'HERDADO' | 'PROPOSTO';
    monthlyInterest: 'HERDADO' | 'PROPOSTO';
    penalty: 'HERDADO' | 'PROPOSTO';
  };
  differsFromDefault: boolean;
}

export interface RenegociacaoPreviewTotals {
  principalCents: number;
  accruedInterestCents: number;
  accruedPenaltyCents: number;
  grossDebtCents: number;
  waivedInterestCents: number;
  waivedPenaltyCents: number;
  commercialDiscountCents: number;
  negotiatedCents: number;
  negotiatedTotalCents: number;
  downPaymentCents: number;
  financedCents: number;
}

export interface RenegociacaoPreview {
  version: number;
  asOf: string;
  identity: RenegociacaoIdentity;
  selection: {
    receivableIds: string[];
    itemCount: number;
    overdueCount: number;
    futureCount: number;
  };
  sourceItems: RenegociacaoSourceItem[];
  policySnapshot: RenegociacaoPolicySnapshot;
  calculationSnapshot: Record<string, unknown>;
  totals: RenegociacaoPreviewTotals;
  schedule: {
    installmentCount: number;
    firstDueDate: string;
    entries: RenegociacaoScheduleEntry[];
  };
  requiresApproval: boolean;
  approvalReasons: string[];
  selectionFingerprint: string;
  policyFingerprint: string;
  calculationFingerprint: string;
  proposalFingerprint: string;
}

export interface RenegociacaoProposalSummary extends RenegociacaoIdentity {
  id: string;
  lifecycleStatus: RenegociacaoLifecycleStatus;
  version: number;
  studentName: string;
  className: string;
  classCode: string | null;
  sourceCount: number;
  sourcePrincipalCents: number;
  sourceOpenCents: number;
  negotiatedCents: number;
  installmentCount: number;
  firstDueDate: string;
  asOf: string;
  selectionFingerprint: string;
  policyFingerprint: string;
  calculationFingerprint: string;
  proposalFingerprint: string;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  canceledReason: string | null;
  capabilities: {
    canDiscard: boolean;
    canActivate: false;
    activationUnavailableReason: string;
  };
}

export interface RenegociacaoProposalPage {
  rows: RenegociacaoProposalSummary[];
  totalItems: number;
  page: number;
  pageSize: number;
  capabilities: Partial<RenegociacaoCapabilities>;
}

export interface RenegociacaoEvent {
  id: string;
  type: string;
  label: string;
  occurredAt: string;
  actorName: string | null;
  details: string | null;
}

export interface RenegociacaoProposalDetail {
  proposal: RenegociacaoProposalSummary;
  sourceItems: RenegociacaoSourceItem[];
  terms: RenegociacaoTerms;
  policyOverrides: RenegociacaoPolicyOverrides;
  policySnapshot: RenegociacaoPolicySnapshot;
  calculationSnapshot: Record<string, unknown>;
  totals: RenegociacaoPreviewTotals;
  schedule: RenegociacaoPreview['schedule'];
  fingerprints: {
    selection: string;
    policy: string;
    calculation: string;
    proposal: string;
  };
  canonicalSnapshot: Record<string, unknown> & {
    requiresApproval: boolean;
    approvalReasons: string[];
  };
  events: RenegociacaoEvent[];
  capabilities: Partial<RenegociacaoCapabilities>;
}

export interface PreviewRenegociacaoInput {
  receivableIds: string[];
  terms: RenegociacaoTerms;
  policyOverrides: RenegociacaoPolicyOverrides;
  asOf?: string | null;
}

export interface SaveRenegociacaoProposalInput extends PreviewRenegociacaoInput {
  requestId: string;
  expectedProposalFingerprint: string;
  submit: boolean;
  reason: string | null;
}

export interface SaveRenegociacaoResult {
  proposal: RenegociacaoProposalSummary;
  replayed: boolean;
}

export interface DiscardRenegociacaoProposalInput {
  requestId: string;
  agreementId: string;
  expectedVersion: number;
  expectedFingerprint: string;
  reason: string;
}

export type DiscardRenegociacaoResult = SaveRenegociacaoResult;
