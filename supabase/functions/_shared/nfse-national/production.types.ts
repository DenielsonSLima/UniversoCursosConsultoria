import type { NationalDpsInput } from './dps.types.ts';
import type { CancellationInput, CancellationEventCode } from './events.ts';
import type { NationalHttpResponse } from './mtls.ts';
import type { XmlSignatureProfile } from './signature.ts';

export type ProductionSchemaName = 'DPS_v1.01.xsd' | 'NFSe_v1.01.xsd' |
  'pedRegEvento_v1.01.xsd' | 'evento_v1.01.xsd';
export interface ProductionSchemaValidator {
  validate(xml: string, schema: ProductionSchemaName,
    environment: 'HOMOLOGACAO' | 'PRODUCAO'): Promise<void>;
}
export interface ProductionDependencies {
  schema: ProductionSchemaValidator;
  credential: { privateKeyPem: string; certificatePem: string };
  signatureProfile: XmlSignatureProfile;
  transport: { request(method: 'GET' | 'POST', path: string, body?: string): Promise<NationalHttpResponse> };
  /** Server-owned evidence, current authorization and durable dispatch lease, never browser data. */
  assertLiveContract(operation: 'ISSUE' | 'CANCEL'): void;
}
/** Persist these exact signed bytes before claiming the one permitted POST. */
export interface PreparedProductionDps {
  input: NationalDpsInput;
  dpsId: string;
  signedDpsXml: string;
}
export type ProductionDpsIdentityShape = 'MATCH_EXPECTED_DPS' | 'MATCH_WITHOUT_DPS_PREFIX' |
  'NFS_PREFIX' | 'OTHER_STRING' | 'NULL' | 'NUMBER' | 'BOOLEAN' | 'OBJECT' | 'UNDEFINED';
export interface ProductionDpsIdentityDiagnostics {
  expectedDpsLength: number;
  idDps?: ProductionDpsIdentityShape;
  idDPS?: ProductionDpsIdentityShape;
  chaveAcessoPresent: boolean;
}
export type ProductionIssueResult =
  | { state: 'AUTHORIZED'; dpsId: string; accessKey: string; number: string;
      authorizedXml: string; signedDpsXml: string }
  | { state: 'REJECTED'; dpsId: string; codes: string[]; signedDpsXml: string }
  | { state: 'AWAITING_CONFIRMATION'; dpsId: string; code: string; signedDpsXml: string;
      diagnostics?: ProductionDpsIdentityDiagnostics }
  | { state: 'BLOCKED'; code: string };

export interface PreparedProductionCancellation {
  input: CancellationInput;
  eventReferenceId: string;
  signedEventXml: string;
}
export type ConfirmedCancellationState = 'CANCELLED' | 'AWAITING_ANALYSIS' | 'ANALYSIS_DENIED' | 'SUBSTITUTED';
export interface ProductionEventPayloadEvidence {
  reasonEncoding: 'SEFIN_UTF8_AS_LATIN1';
  literalPayloadMatches: false;
  representationMatches: true;
}
export interface ProductionCancellationDiagnostics {
  execution: 'CANCEL' | 'RECONCILE_CANCEL';
  postAttemptedInThisExecution: boolean;
  postResponseStatus?: number;
  errorLocation?: 'BEFORE_POST_LOOKUP' | 'POST_REQUEST' | 'POST_REJECTION_ENVELOPE' | 'AFTER_POST_LOOKUP' | 'RECONCILE_LOOKUP';
  consult?: {
    phase: 'BEFORE_POST' | 'AFTER_POST' | 'RECONCILE';
    httpStatus: number;
  };
}
export type ProductionCancellationResult =
  | { state: 'CONFIRMED'; accessKey: string; eventId: string; eventCode: string;
      eventXml: string; cancellationState: ConfirmedCancellationState; signedEventXml: string;
      code?: 'CONFIRMED'; payloadEvidence?: ProductionEventPayloadEvidence }
  | { state: 'REJECTED'; accessKey: string; codes: string[]; signedEventXml: string }
  | { state: 'AWAITING_CONFIRMATION'; accessKey: string; code: string; signedEventXml: string;
      diagnostics?: ProductionCancellationDiagnostics }
  | { state: 'BLOCKED'; code: string };

/** Server-owned official API contract and authenticated response evidence, never browser choices. */
export interface ProductionEventEnvelopeContract {
  requestProperty: string;
  listProperty: string | null;
  responseMode?: 'LIST' | 'SINGLE_EVENT' | 'ARCHIVE_DOUBLE_BASE64_GZIP';
  lookupSequence?: '001';
  xmlProperty: string;
  /** Event identification field in an item, if the official schema provides one. */
  eventIdProperty: string | null;
}
export interface ProductionCancellationDependencies extends ProductionDependencies {
  eventContract: ProductionEventEnvelopeContract;
  /** Checks eligibility for this document; must not treat a previous GET as a guarantee. */
  assertCancellationAllowed(input: CancellationInput): void;
}
export interface VerifiedProductionEvent {
  accessKey: string;
  environment: 'PRODUCAO';
  code: CancellationEventCode | string;
  sequence: string;
  id: string;
  xml: string;
  payloadEvidence?: ProductionEventPayloadEvidence;
}
