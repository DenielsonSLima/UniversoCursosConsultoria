import type { NationalDpsInput } from './dps.types.ts';
import type { XmlSignatureProfile } from './signature.ts';
import type { NationalHttpResponse } from './mtls.ts';

export interface HomologationSchemaValidator {
  validate(xml: string, schema: 'DPS_v1.01.xsd' | 'NFSe_v1.01.xsd' | 'pedRegEvento_v1.01.xsd',
    environment: 'HOMOLOGACAO' | 'PRODUCAO'): Promise<void>;
}
export interface NationalPilotIntent { input: NationalDpsInput; expectedDpsId: string }
export type NationalPilotResult =
  | { state: 'AUTHORIZED'; dpsId: string; accessKey: string; number: string;
      authorizedXml: string; signedDpsXml: string }
  | { state: 'REJECTED'; dpsId: string; codes: string[]; signedDpsXml: string }
  | { state: 'AWAITING_CONFIRMATION'; dpsId: string; code: string; signedDpsXml?: string }
  | { state: 'BLOCKED'; code: string };
export interface NationalPilotDependencies {
  schema: HomologationSchemaValidator;
  credential: { privateKeyPem: string; certificatePem: string };
  signatureProfile: XmlSignatureProfile;
  transport: {
    request(method: 'GET' | 'POST', path: string, body?: string): Promise<NationalHttpResponse>;
  };
  /** Server-owned evidence gate. Never construct this from request body or a browser flag. */
  assertLiveContract(): void;
}
