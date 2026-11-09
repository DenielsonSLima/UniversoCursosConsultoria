import { createContext, useContext } from 'react';
import type { NfseScope, NfseWorkspace } from '../types/nfse.types';

export interface NfseTabContextValue {
  scope: NfseScope | null;
  workspace?: NfseWorkspace;
  unavailable: boolean;
  canRead: boolean;
  loading: boolean;
  canPrepareQueue?: boolean;
  onPrepared: (message?: string) => void;
}

export const NfseTabContext = createContext<NfseTabContextValue | null>(null);

export function useNfseTabContext() {
  const context = useContext(NfseTabContext);
  if (!context) throw new Error('O conteúdo fiscal precisa estar dentro do Emissor NFS-e.');
  return context;
}
