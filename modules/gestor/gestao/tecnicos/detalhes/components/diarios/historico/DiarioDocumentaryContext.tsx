import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { DiarioHistorico } from './diario-historico.types';
import { buildDocumentaryEvidence } from './diario-documentary.presentation';

const DiarioDocumentaryContext = createContext<ReturnType<typeof buildDocumentaryEvidence> | null>(null);

export const DiarioDocumentaryProvider = ({ history, children }: {
  history: DiarioHistorico; children: ReactNode;
}) => {
  const evidence = useMemo(() => buildDocumentaryEvidence(history), [history]);
  return <DiarioDocumentaryContext.Provider value={evidence}>{children}</DiarioDocumentaryContext.Provider>;
};

export const useDiarioDocumentary = () => useContext(DiarioDocumentaryContext);
