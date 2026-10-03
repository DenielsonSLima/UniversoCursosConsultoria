import { useCallback, useEffect, useState } from 'react';
import { financialSectionSearch, readFinancialSection, type FinancialSectionId } from '../financeiro-sections';

export function useFinancialSection() {
  const [section, setSection] = useState<FinancialSectionId>(
    () => readFinancialSection(window.location.search) || 'resumo',
  );

  useEffect(() => {
    const onPopState = () => setSection(readFinancialSection(window.location.search) || 'resumo');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((next: FinancialSectionId, replace = false) => {
    const url = new URL(window.location.href);
    const search = financialSectionSearch(url.search, next);
    if (url.search !== search) {
      url.search = search;
      window.history[replace ? 'replaceState' : 'pushState'](window.history.state, '', url);
    }
    setSection(next);
  }, []);

  return [section, navigate] as const;
}
