export interface PreflightScope {
  contextKey: string;
  poloId: string;
  environment: 'HOMOLOGACAO';
  month: string;
}

export interface PreflightIntent {
  scope: PreflightScope;
  referenceDate: string;
  serviceCode?: string;
}

/** This type must remain entirely inside the server executor. */
export interface PreflightMaterial extends PreflightScope {
  actorId: string;
  configurationVersion: number;
  issuer: {
    cnpj: string;
    municipalityCode: string;
    municipalRegistration: string | null;
    opSimpNac: string;
    regEspTrib: string;
    regApTribSN: string | null;
  };
  certificate: { notBefore: string; expiresAt: string; fingerprint: string };
  material: { certificatePem: string; chainPem: string; privateKeyPem: string };
}

export interface PreflightCheck {
  code: string;
  status: 'PASSED' | 'BLOCKED' | 'UNKNOWN';
  message: string;
}

export interface PublicProbeResponse {
  status: number;
  body: string;
  tlsVerified: boolean;
}

export interface PreflightTransport {
  get(url: string): Promise<PublicProbeResponse>;
  close(): void;
}
