import { ProescError } from './contract.ts';

export type ProescVersion = 'v1' | 'v2';
export function proescVersion(value: unknown): ProescVersion {
  if (value !== 'v1' && value !== 'v2') throw new ProescError('Escolha a conexão Proesc V1 ou V2.');
  return value;
}

export function connectionToken(version: ProescVersion, value: unknown): string {
  const token = typeof value === 'string' ? value.trim().replace(/^Bearer\s+/i, '') : '';
  if (token.length < 12 || token.length > 8192 || /\s/.test(token)
    || [...token].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new ProescError('Informe um token Proesc válido.');
  }
  const v1 = /^[0-9a-f]{32}$/i.test(token);
  if ((version === 'v1') !== v1) {
    throw new ProescError(version === 'v1' ? 'Use a chave geral da API V1 nesta conexão.'
      : 'Use o token Bearer da API V2 nesta conexão. A chave V1 pertence à outra conexão.');
  }
  return token;
}

export function connectionWaf(value: unknown): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())) {
    throw new ProescError('Informe o código de liberação fornecido pelo suporte Proesc.');
  }
  return value.trim();
}

export function v2Headers(token: string, wafHeader?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json', Authorization: `Bearer ${connectionToken('v2', token)}`,
  };
  const waf = connectionWaf(wafHeader);
  if (waf) headers['x-proesc-waf'] = waf;
  return headers;
}
