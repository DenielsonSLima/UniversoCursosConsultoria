/** Presentation of national XML. Parsing is not an authorization/signature verdict. */
export interface DanfseDocument {
  accessKey: string;
  number: string;
  environment: '1' | '2';
  fields: Readonly<Record<string, readonly string[]>>;
}

export interface DanfseAssets {
  logo: Uint8Array;
  regularFont: string;
  boldFont: string;
}

/** Authenticated backend status, independent from the immutable authorization XML. */
export interface DanfseRenderOptions {
  cancellationState?: 'CONFIRMED' | null;
}

export const DANFSE_XML_NAMESPACE = 'http://www.sped.fazenda.gov.br/nfse';
export const DANFSE_XML_MAX_BYTES = 2 * 1024 * 1024;
export const DPS = 'DPS/infDPS/';

export function xmlValue(document: DanfseDocument, path: string): string {
  return document.fields[path]?.[0] ?? '';
}

export function dpsValue(document: DanfseDocument, path: string): string {
  return xmlValue(document, DPS + path);
}

/** The host and query are fixed by NT 008/2026; no URL from the XML is followed. */
export function danfseConsultationUrl(accessKey: string): string {
  if (!/^\d{50}$/.test(accessKey)) throw new Error('Chave de acesso inválida.');
  return `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${accessKey}`;
}
