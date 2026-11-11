import { useCallback, useSyncExternalStore } from 'react';
import type { NfseEnvironment } from '../types/nfse.types';
import { DEFAULT_NFSE_ENVIRONMENT, nfseEnvironmentPreferenceKey, nfseEnvironmentPreferences,
  type NfseEnvironmentPreferenceScope } from './nfse-environment.store';

/** Configuration and issuer share one tab-local preference per institutional scope and establishment. */
export function useNfseEnvironment(scope: NfseEnvironmentPreferenceScope) {
  const key = nfseEnvironmentPreferenceKey(scope);
  const get = useCallback(() => nfseEnvironmentPreferences.get(key), [key]);
  const subscribe = useCallback((changed: () => void) => nfseEnvironmentPreferences.subscribe(key, changed), [key]);
  const environment = useSyncExternalStore(subscribe, get, () => DEFAULT_NFSE_ENVIRONMENT);
  const setEnvironment = useCallback((value: NfseEnvironment) => nfseEnvironmentPreferences.set(key, value), [key]);
  return [environment, setEnvironment] as const;
}
