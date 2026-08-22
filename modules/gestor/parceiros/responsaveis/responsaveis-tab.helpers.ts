import type { ResponsaveisLegaisScope } from './responsaveis.contract';

export const RESPONSAVEL_FIELD_CLASS_NAME = 'mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';

export const MISSING_RESPONSAVEIS_SCOPE: ResponsaveisLegaisScope = {
  poloId: 'escopo-ausente',
  includeGlobal: false,
};

const createStableRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  throw new Error('Este navegador não consegue identificar com segurança esta tentativa de preparo de acesso.');
};

export const isVerificationReferenceValid = (value: string) => {
  const length = value.trim().length;
  return length >= 3 && length <= 120;
};

export const getStableRequestId = (registry: Map<string, string>, fingerprint: string) => {
  const current = registry.get(fingerprint);
  if (current) return current;
  const created = createStableRequestId();
  registry.set(fingerprint, created);
  return created;
};
