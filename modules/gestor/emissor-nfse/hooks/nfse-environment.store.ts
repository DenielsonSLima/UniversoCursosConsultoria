import type { NfseEnvironment } from '../types/nfse.types';

type PreferenceStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
export type NfseEnvironmentPreferenceScope = { contextKey?: string | null; poloId?: string | null };
export const DEFAULT_NFSE_ENVIRONMENT: NfseEnvironment = 'PRODUCAO';

export function nfseEnvironmentPreferenceKey(scope: NfseEnvironmentPreferenceScope): string | null {
  return scope.contextKey && scope.poloId
    ? `nfse:fiscal-environment:v1:${JSON.stringify([scope.contextKey, scope.poloId])}` : null;
}

const isEnvironment = (value: unknown): value is NfseEnvironment => value === 'PRODUCAO' || value === 'HOMOLOGACAO';
const browserPreferenceStorage = () => typeof window === 'undefined' ? undefined : window.sessionStorage;

/** A UI preference only. Authorization and fiscal environment remain server-validated. */
export function createNfseEnvironmentStore(storage: () => PreferenceStorage | undefined = browserPreferenceStorage) {
  const values = new Map<string, NfseEnvironment>();
  const listeners = new Map<string, Set<() => void>>();
  const get = (key: string | null): NfseEnvironment => {
    if (!key) return DEFAULT_NFSE_ENVIRONMENT;
    if (!values.has(key)) {
      let value: unknown;
      try { value = storage()?.getItem(key); } catch { /* Private browsing can deny storage. */ }
      values.set(key, isEnvironment(value) ? value : DEFAULT_NFSE_ENVIRONMENT);
    }
    return values.get(key)!;
  };
  return {
    get,
    set(key: string | null, value: NfseEnvironment) {
      if (!key || !isEnvironment(value)) return;
      const previous = get(key);
      values.set(key, value);
      try { storage()?.setItem(key, value); } catch { /* The in-memory preference remains usable. */ }
      if (previous !== value) listeners.get(key)?.forEach(changed => changed());
    },
    subscribe(key: string | null, changed: () => void) {
      if (!key) return () => {};
      const scoped = listeners.get(key) ?? new Set<() => void>();
      scoped.add(changed); listeners.set(key, scoped);
      return () => { scoped.delete(changed); if (!scoped.size) listeners.delete(key); };
    },
  };
}

export const nfseEnvironmentPreferences = createNfseEnvironmentStore();
