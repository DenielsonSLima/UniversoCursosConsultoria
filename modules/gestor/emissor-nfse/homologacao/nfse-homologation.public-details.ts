import type { NfseHomologationEndpoint, NfseHomologationMunicipalParameter, NfsePublicParameter } from './nfse-homologation.types';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const code = (value: unknown) => typeof value === 'string' && /^[A-Z0-9_]{1,80}$/.test(value) ? value : null;
const status = (value: unknown) => value === null ? null : Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599 ? Number(value) : null;
function publicUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if ([...url.searchParams].some(([key, value]) => !/^(?:dataCompetencia|dataInicial|dataFinal)$/i.test(key) || !/^\d{4}-\d{2}-\d{2}$/.test(value))) return null;
    return url.protocol === 'https:' && ['adn.producaorestrita.nfse.gov.br', 'sefin.producaorestrita.nfse.gov.br'].includes(url.hostname)
      && !url.username && !url.password && !url.hash ? url.href : null;
  } catch { return null; }
}
/** Retain public flags/codes only; never arbitrary free text, identity or certificate fields. */
function parameters(value: unknown, depth = 0): NfsePublicParameter {
  if (depth > 6) return null;
  if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map(item => parameters(item, depth + 1));
  if (!object(value)) return null;
  return Object.fromEntries(Object.entries(value).slice(0, 100).flatMap(([key, item]) => {
    if (!/^[\p{L}\p{N}_-]{1,80}$/u.test(key) || /cpf|cnpj|document|nome|name|email|telefone|private|secret|token|certificate|fingerprint|xml|pem|password|senha/i.test(key)) return [];
    if (typeof item === 'string') {
      const date = /^\d{4}-\d{2}-\d{2}(?:T[0-9:.+Z-]{1,24})?$/.test(item);
      const publicCode = /^(codigo|code|status|ambiente|situacao|tipo|regime)/i.test(key) && /^[\p{L}\p{N}_ ./-]{1,60}$/u.test(item);
      return !/\d{11}/.test(item) && (date || publicCode) ? [[key, item]] : [];
    }
    const clean = parameters(item, depth + 1); return clean === null ? [] : [[key, clean]];
  }));
}
export function parseNfsePublicPreflightDetails(data: Record<string, unknown>) {
  const endpoints: NfseHomologationEndpoint[] = Array.isArray(data.endpoints) ? data.endpoints.slice(0, 30).flatMap(item => {
    if (!object(item)) return [];
    const url = publicUrl(item.url), kind = code(item.code);
    return url && kind ? [{ code: kind, url, status: status(item.status), tlsVerified: item.tlsVerified === true, error: code(item.error) }] : [];
  }) : [];
  const municipalParameters: NfseHomologationMunicipalParameter[] = Array.isArray(data.municipalParameters) ? data.municipalParameters.slice(0, 20).flatMap(item => {
    if (!object(item)) return [];
    const url = publicUrl(item.url), kind = code(item.code), diagnostic = code(item.diagnostic);
    return url && kind && diagnostic ? [{ code: kind, url, status: status(item.status), diagnostic, parameters: parameters(item.parameters) }] : [];
  }) : [];
  return { endpoints, municipalParameters };
}
