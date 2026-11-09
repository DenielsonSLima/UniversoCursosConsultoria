/** Canonical backend policy only: these facts must never be trusted from a browser request. */
export interface CancellationPolicyInput {
  now: string;
  actorAuthorizedAsIssuer: boolean;
  document: {
    accessKey: string;
    environment: 'HOMOLOGACAO' | 'PRODUCAO';
    municipalityCode: string;
    state: 'AUTHORIZED' | 'CANCELLED' | 'SUBSTITUTED' | 'UNKNOWN';
    serviceAmount: string;
    recipientIdentified: boolean | null;
    taxesPaid: boolean | null;
  };
  /** Comes from a current authoritative consultation of this document's linked events. */
  eventEligibility: null | {
    accessKey: string;
    environment: 'HOMOLOGACAO' | 'PRODUCAO';
    checkedAt: string;
    validUntil: string;
    directCancellationAllowed: boolean | null;
    analysisRequestAllowed: boolean | null;
  };
  municipalRules: null | {
    source: 'MUNICIPAL_PARAMETER_API';
    municipalityCode: string;
    environment: 'HOMOLOGACAO' | 'PRODUCAO';
    checkedAt: string;
    validUntil: string;
    /** Deadline resolved for this document by the fiscal backend, including the applicable time zone. */
    deadline: null | { mode: 'NO_LIMIT' } | { mode: 'UNTIL'; at: string };
    maximumValue: null | { mode: 'NO_LIMIT' } | { mode: 'LIMIT'; amount: string };
    unidentifiedRecipientAllowed: boolean | null;
    cancellationAfterTaxPaymentAllowed: boolean | null;
    analysisRequestAllowed: boolean | null;
  };
}

export interface CancellationCapability {
  allowed: boolean;
  blockers: string[];
}

function money(value: string): bigint | null {
  return typeof value === 'string' && /^(?:0|[1-9]\d{0,14})\.\d{2}$/.test(value) ?
    BigInt(value.replace('.', '')) : null;
}

function time(value: string): number {
  if (typeof value !== 'string') return NaN;
  const match = /^(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/.exec(value);
  if (!match || Number(match[3]) > new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate())
    return NaN;
  return Date.parse(value);
}

function currentEvidence(checkedAt: string, validUntil: string, now: number): boolean {
  const checked = time(checkedAt);
  const valid = time(validUntil);
  return Number.isFinite(now) && Number.isFinite(checked) && Number.isFinite(valid) &&
    checked <= now && valid >= now && valid >= checked;
}

/** Does not submit an event, change an invoice state or silently fall back to another operation. */
export function evaluateCancellationPolicy(input: CancellationPolicyInput): {
  cancel: CancellationCapability;
  requestAnalysis: CancellationCapability;
} {
  const common: string[] = [];
  const direct: string[] = [];
  const analysis: string[] = [];
  const doc = input.document;
  const now = time(input.now);
  if (input.actorAuthorizedAsIssuer !== true) common.push('ISSUER_AUTHORIZATION_REQUIRED');
  if (doc.state !== 'AUTHORIZED' || typeof doc.accessKey !== 'string' || !/^\d{50}$/.test(doc.accessKey) ||
      typeof doc.municipalityCode !== 'string' || !/^\d{7}$/.test(doc.municipalityCode) ||
      !['HOMOLOGACAO', 'PRODUCAO'].includes(doc.environment)) common.push('AUTHORIZED_DOCUMENT_REQUIRED');
  const amount = money(doc.serviceAmount);
  if (amount === null || amount <= 0n) common.push('CANONICAL_SERVICE_AMOUNT_REQUIRED');
  const events = input.eventEligibility;
  if (!events || events.accessKey !== doc.accessKey || events.environment !== doc.environment ||
      !currentEvidence(events.checkedAt, events.validUntil, now)) common.push('CURRENT_EVENTS_REQUIRED');
  else {
    if (events.directCancellationAllowed !== true) direct.push('E0840_OR_EVENTS_UNVERIFIED');
    if (events.analysisRequestAllowed !== true) analysis.push('E0848_OR_EVENTS_UNVERIFIED');
  }
  const rules = input.municipalRules;
  if (!rules || rules.source !== 'MUNICIPAL_PARAMETER_API' || rules.municipalityCode !== doc.municipalityCode ||
      rules.environment !== doc.environment || !currentEvidence(rules.checkedAt, rules.validUntil, now)) {
    common.push('CURRENT_MUNICIPAL_RULES_REQUIRED');
  } else {
    if (!rules.deadline) direct.push('MUNICIPAL_DEADLINE_UNKNOWN');
    else if (rules.deadline.mode === 'UNTIL') {
      const deadline = time(rules.deadline.at);
      if (!Number.isFinite(deadline)) direct.push('MUNICIPAL_DEADLINE_UNKNOWN');
      else if (now > deadline) direct.push('E0822');
    } else if (rules.deadline.mode !== 'NO_LIMIT') direct.push('MUNICIPAL_DEADLINE_UNKNOWN');
    if (!rules.maximumValue) direct.push('MUNICIPAL_MAXIMUM_VALUE_UNKNOWN');
    else if (rules.maximumValue.mode === 'LIMIT') {
      const maximum = money(rules.maximumValue.amount);
      if (maximum === null) direct.push('MUNICIPAL_MAXIMUM_VALUE_UNKNOWN');
      else if (amount !== null && amount > maximum) direct.push('E0823');
    } else if (rules.maximumValue.mode !== 'NO_LIMIT') direct.push('MUNICIPAL_MAXIMUM_VALUE_UNKNOWN');
    if (doc.recipientIdentified !== true) {
      if (typeof doc.recipientIdentified !== 'boolean' || typeof rules.unidentifiedRecipientAllowed !== 'boolean')
        direct.push('RECIPIENT_RULE_UNKNOWN');
      else if (!rules.unidentifiedRecipientAllowed) direct.push('E0824');
    }
    if (doc.taxesPaid !== false) {
      if (typeof doc.taxesPaid !== 'boolean' || typeof rules.cancellationAfterTaxPaymentAllowed !== 'boolean')
        direct.push('TAX_PAYMENT_RULE_UNKNOWN');
      else if (!rules.cancellationAfterTaxPaymentAllowed) direct.push('E0827');
    }
    if (rules.analysisRequestAllowed !== true) analysis.push('FISCAL_ANALYSIS_NOT_ENABLED');
  }
  const capability = (specific: string[]) => ({
    allowed: common.length === 0 && specific.length === 0,
    blockers: [...common, ...specific],
  });
  return { cancel: capability(direct), requestAnalysis: capability(analysis) };
}
