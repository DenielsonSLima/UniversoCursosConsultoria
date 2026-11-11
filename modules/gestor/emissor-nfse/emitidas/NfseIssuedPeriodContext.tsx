import React, { createContext, useCallback, useContext, useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { createNfseIssuedPeriod, nfseIssuedQueryFilters, type NfseIssuedPeriodFilters } from './nfse-issued-period';

function usePeriod(month: string) {
  const [filters, updateFilters] = useState(() => createNfseIssuedPeriod(month));
  const [datesPending, setDatesPending] = useState(false);
  const deferredSearch = useDeferredValue(filters.search.trim());
  const setFilters = useCallback((next: Partial<NfseIssuedPeriodFilters>) => {
    updateFilters(previous => ({ ...previous, ...next }));
  }, []);
  const queryFilters = useMemo(() => nfseIssuedQueryFilters({ ...filters, search: deferredSearch }), [filters, deferredSearch]);
  return { filters, setFilters, queryFilters, datesPending, setDatesPending,
    isSettling: datesPending || deferredSearch !== filters.search.trim() };
}

const NfseIssuedPeriodContext = createContext<ReturnType<typeof usePeriod> | null>(null);

type PeriodProps = { month: string; children: ReactNode };

const PeriodState: React.FC<PeriodProps> = ({ month, children }) => {
  const period = usePeriod(month);
  return <NfseIssuedPeriodContext.Provider value={period}>{children}</NfseIssuedPeriodContext.Provider>;
};

export const NfseIssuedPeriodProvider: React.FC<PeriodProps> = ({ month, children }) => {
  return <PeriodState key={month} month={month}>{children}</PeriodState>;
};

/** Optional for generic document lists used outside the issued workspace. */
export function useNfseIssuedPeriod() { return useContext(NfseIssuedPeriodContext); }
