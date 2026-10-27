/**
 * Review-only orchestration candidate. Its SQL store and worker integration must
 * pass transactional verification before this module is eligible for deployment.
 */
export type Identity = {
  receivableId: string;
  enrollmentId: string;
  classId: string;
  environment: "production" | "sandbox";
  convenio: string;
  nossoNumero: string;
  amountCents: number;
  dueDate: string;
  agency: string;
  payerDocument: string;
  digitableLine: string;
  barcode: string;
  financialTerms: Record<string, unknown>;
};

export type Manifest = {
  operationId: string;
  fingerprint: string;
  canonicalText: string;
  purpose: "FINANCIAL_CORRECTION_CANCEL_ONLY";
  state: "APPROVED" | "COMPLETE";
  items: Identity[];
};

export type Claim = {
  operationId: string;
  manifestFingerprint: string;
  item: Identity;
  leaseToken: string;
  mode: "CANCEL_ALLOWED" | "CONFIRM_ONLY" | "COMPLETE";
};

export type BankResult = {
  convenio: string;
  nossoNumero: string;
  situationCode: number;
  remoteStatus: string;
  alreadyCanceled: boolean;
  mutationAttempted: boolean;
  raw: unknown;
  proof: {
    strictEffectivePayments: true;
    paymentsCount: 0;
    identityValidated: true;
    termsValidated: true;
  };
};

export type BankInput = {
  convenio: string;
  nossoNumero: string;
  expectedAmount: number;
  expectedDueDate: string;
  expectedAgency: string;
  expectedPayerDocument: string;
  expectedDocumentNumber: string;
  expectedCompanyTitleId: string;
  expectedDigitableLine: string;
  expectedBarcode: string;
  expectedFinancialTerms: Record<string, unknown>;
  strictEffectivePayments: true;
  onMutationStart: () => Promise<void>;
};

/** Actor identity is established by the authenticated HTTP boundary, never body. */
export interface CorrectionStore {
  // Authenticate/authorize before reading approval or replay state on every call.
  authorizeAndLoad(operationId: string): Promise<Manifest>;
  // Bind immutable actor + operation + item + lease; reject active other work.
  claim(operationId: string, receivableId: string, fingerprint: string): Promise<Claim>;
  recheckAndMarkIntent(claim: Claim): Promise<void>;
  // Revalidate lease ownership, snapshot/CAS and ALL payment/partial/settlement
  // evidence under locks, even for already-canceled paths that skip intent.
  // Preserve receivables, paid ledger, academic status and original cycle runs.
  complete(claim: Claim, evidence: {
    confirmedAt: string;
    evidenceFingerprint: string;
    bankResult: BankResult;
  }): Promise<void>;
  review(claim: Claim, reason: FailureReason): Promise<void>;
}

export interface CorrectionBank {
  /** Bind only to canonical cancelBaneseBoleto: GET/payments, PUT, GET/payments. */
  cancel(environment: Identity["environment"], input: BankInput): Promise<BankResult>;
  /** GET only. Must validate the same identity, terms and effective payments. */
  confirmOnly(environment: Identity["environment"], input: BankInput): Promise<BankResult>;
}

type FailureReason = "REMOTE_OR_GUARD_REVIEW" | "REMOTE_AMBIGUOUS" |
  "LOCAL_SYNC_AFTER_REMOTE";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fingerprint = /^[a-f0-9]{64}$/;

export class CorrectionBlocked extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}

function block(code: string): never { throw new CorrectionBlocked(code); }
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const digestText = async (value: string) => Array.from(new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const digest = (value: unknown) => digestText(canonicalJson(value));

export const manifestCanonicalText = (operationId: string, items: Identity[]) =>
  canonicalJson({ operationId, purpose: "FINANCIAL_CORRECTION_CANCEL_ONLY", items });

export const manifestFingerprint = (operationId: string, items: Identity[]) =>
  digestText(manifestCanonicalText(operationId, items));

const validateManifest = async (manifest: Manifest, operationId: string) => {
  if (manifest.operationId !== operationId ||
    manifest.purpose !== "FINANCIAL_CORRECTION_CANCEL_ONLY" ||
    !["APPROVED", "COMPLETE"].includes(manifest.state) ||
    !fingerprint.test(manifest.fingerprint) ||
    !Array.isArray(manifest.items) || manifest.items.length < 1 || manifest.items.length > 100) {
    block("INVALID_MANIFEST");
  }
  const ids = new Set<string>();
  const bankIdentities = new Set<string>();
  for (const item of manifest.items) {
    const bankIdentity = `${item.environment}:${item.convenio}:${item.nossoNumero}`;
    const parsedDate = new Date(`${item.dueDate}T00:00:00Z`);
    if (!uuid.test(item.receivableId) || !uuid.test(item.enrollmentId) ||
      !uuid.test(item.classId) || ids.has(item.receivableId) || bankIdentities.has(bankIdentity) ||
      !["production", "sandbox"].includes(item.environment) ||
      !/^\d{1,20}$/.test(item.convenio) || !/^\d{9}$/.test(item.nossoNumero) ||
      !/^\d{3}$/.test(item.agency) || item.agency === "000" ||
      !/^\d{11}$|^\d{14}$/.test(item.payerDocument) ||
      !/^\d{47}$/.test(item.digitableLine) || !/^\d{44}$/.test(item.barcode) ||
      !Number.isSafeInteger(item.amountCents) || item.amountCents <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate) ||
      Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== item.dueDate ||
      !item.financialTerms || Array.isArray(item.financialTerms) ||
      typeof item.financialTerms !== "object") block("INVALID_MANIFEST_ITEM");
    ids.add(item.receivableId);
    bankIdentities.add(bankIdentity);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(manifest.canonicalText); }
  catch { block("MANIFEST_CHANGED"); }
  if (canonicalJson(parsed) !== manifestCanonicalText(operationId, manifest.items) ||
    await digestText(manifest.canonicalText) !== manifest.fingerprint) {
    block("MANIFEST_CHANGED");
  }
};

/** Exactly one approved item; deliberately no global queue or automatic reissue. */
export async function cancelCorrectionItem(
  request: { operationId: string; receivableId: string; manifestFingerprint: string },
  dependencies: { store: CorrectionStore; bank: CorrectionBank; now?: () => Date },
): Promise<{ state: "COMPLETE"; replayed: boolean }> {
  if (Object.keys(request).sort().join(",") !==
      "manifestFingerprint,operationId,receivableId" ||
    !uuid.test(request.operationId) || !uuid.test(request.receivableId) ||
    !fingerprint.test(request.manifestFingerprint)) block("INVALID_REQUEST");
  const { store, bank } = dependencies;
  // Authorization must be repeated even on COMPLETE/idempotent replays.
  const manifest = await store.authorizeAndLoad(request.operationId);
  await validateManifest(manifest, request.operationId);
  if (manifest.fingerprint !== request.manifestFingerprint) block("STALE_APPROVAL");
  const expected = manifest.items.find((item) => item.receivableId === request.receivableId);
  if (!expected) block("ITEM_OUTSIDE_MANIFEST");
  const claim = await store.claim(request.operationId, request.receivableId, manifest.fingerprint);
  if (claim.operationId !== request.operationId ||
    claim.manifestFingerprint !== manifest.fingerprint ||
    canonicalJson(claim.item) !== canonicalJson(expected) ||
    !uuid.test(claim.leaseToken) ||
    !["CANCEL_ALLOWED", "CONFIRM_ONLY", "COMPLETE"].includes(claim.mode)) {
    block("CLAIM_SCOPE_MISMATCH");
  }
  if (manifest.state === "COMPLETE" && claim.mode !== "COMPLETE") {
    block("COMPLETED_OPERATION_REOPENED");
  }
  if (claim.mode === "COMPLETE") return { state: "COMPLETE", replayed: true };
  let mutationStarted = false;
  let remoteConfirmed = false;
  try {
    const input: BankInput = {
      convenio: expected.convenio, nossoNumero: expected.nossoNumero,
      expectedAmount: expected.amountCents / 100,
      expectedDueDate: expected.dueDate, expectedAgency: expected.agency,
      expectedPayerDocument: expected.payerDocument,
      expectedDocumentNumber: expected.receivableId.slice(0, 15),
      expectedCompanyTitleId: expected.receivableId.slice(0, 25),
      expectedDigitableLine: expected.digitableLine, expectedBarcode: expected.barcode,
      expectedFinancialTerms: expected.financialTerms, strictEffectivePayments: true,
      onMutationStart: async () => {
        if (claim.mode !== "CANCEL_ALLOWED") block("CONFIRM_ONLY_MUTATION_BLOCKED");
        // Atomic lease/CAS, local settlement and other-operation checks are required.
        await store.recheckAndMarkIntent(claim);
        mutationStarted = true;
      },
    };
    const result = claim.mode === "CONFIRM_ONLY"
      ? await bank.confirmOnly(expected.environment, input)
      : await bank.cancel(expected.environment, input);
    if (result.convenio !== expected.convenio || result.nossoNumero !== expected.nossoNumero ||
      result.situationCode !== 5 || result.remoteStatus !== "CANCELED" ||
      typeof result.alreadyCanceled !== "boolean" ||
      result.mutationAttempted !== mutationStarted ||
      result.alreadyCanceled === result.mutationAttempted ||
      result.proof?.strictEffectivePayments !== true || result.proof?.paymentsCount !== 0 ||
      result.proof?.identityValidated !== true || result.proof?.termsValidated !== true) {
      block("BANK_CONFIRMATION_INVALID");
    }
    remoteConfirmed = true;
    await store.complete(claim, {
      confirmedAt: (dependencies.now?.() ?? new Date()).toISOString(),
      evidenceFingerprint: await digest(result), bankResult: result,
    });
    return { state: "COMPLETE", replayed: false };
  } catch {
    const reason: FailureReason = remoteConfirmed ? "LOCAL_SYNC_AFTER_REMOTE" :
      mutationStarted ? "REMOTE_AMBIGUOUS" : "REMOTE_OR_GUARD_REVIEW";
    try { await store.review(claim, reason); }
    catch { block("AUDIT_WRITE_FAILED"); }
    block(reason);
  }
}
