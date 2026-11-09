import React, { createContext, useContext, useState } from 'react';
import { getNfseCurrentMonth } from '../../types/nfse.scope';
import { createNfsePreparationAttempt } from '../../fila/nfse-preparation-attempt';

interface NfsePreparationDraft {
  month: string;
  ids: string[];
  modelId: string;
}

interface DraftContextValue {
  draft: NfsePreparationDraft;
  setDraft: React.Dispatch<React.SetStateAction<NfsePreparationDraft>>;
  preparationAttempt: ReturnType<typeof createNfsePreparationAttempt>;
}

const DraftContext = createContext<DraftContextValue | null>(null);

/** Keep the current preparation while navigating tabs within the same polo/month. */
export function NfsePreparationDraftProvider({ children }: React.PropsWithChildren) {
  const [preparationAttempt] = useState(() => createNfsePreparationAttempt());
  const [draft, setDraft] = useState<NfsePreparationDraft>(() => ({
    month: getNfseCurrentMonth(), ids: [], modelId: '',
  }));
  return <DraftContext.Provider value={{ draft, setDraft, preparationAttempt }}>{children}</DraftContext.Provider>;
}

export function useNfsePreparationDraft() {
  const context = useContext(DraftContext);
  if (!context) throw new Error('A preparação precisa estar dentro do Emissor NFS-e.');
  return context;
}
