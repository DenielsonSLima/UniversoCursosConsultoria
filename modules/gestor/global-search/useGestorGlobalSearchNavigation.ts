import { useCallback, useEffect, useState } from 'react';
import type { GestorGlobalSearchResult } from './gestor-global-search.types';

interface UseGestorGlobalSearchNavigationOptions {
  activeModule: string;
  effectivePoloId: string | null;
  hasOpenPartnerDetails: boolean;
  canOpenModule: (moduleId: string) => boolean;
  changePolo: (poloId: string) => Promise<boolean>;
  setActiveModule: (moduleId: string, skipUnsavedConfirmation?: boolean) => boolean;
  setSearchQuery: (query: string) => void;
  setIsSearchFocused: (focused: boolean) => void;
}

export const useGestorGlobalSearchNavigation = ({
  activeModule,
  effectivePoloId,
  hasOpenPartnerDetails,
  canOpenModule,
  changePolo,
  setActiveModule,
  setSearchQuery,
  setIsSearchFocused,
}: UseGestorGlobalSearchNavigationOptions) => {
  const [searchTarget, setSearchTarget] = useState<GestorGlobalSearchResult | null>(null);

  useEffect(() => {
    if (activeModule !== 'parceiros') setSearchTarget(null);
  }, [activeModule]);

  const clearSearchTarget = useCallback(() => setSearchTarget(null), []);

  const handleSearchResultClick = useCallback(async (result: GestorGlobalSearchResult) => {
    if (!canOpenModule('parceiros')) return;
    if (
      activeModule === 'parceiros'
      && hasOpenPartnerDetails
      && !window.confirm('Deseja sair do cadastro atual e abrir outro? Alterações não salvas, se houver, serão descartadas.')
    ) return;

    let poloChanged = false;
    if (result.poloId && result.poloId !== effectivePoloId) {
      const changed = await changePolo(result.poloId);
      if (!changed) return;
      poloChanged = true;
    }
    if (!setActiveModule('parceiros', poloChanged)) return;

    setSearchTarget(result);
    setSearchQuery('');
    setIsSearchFocused(false);
  }, [activeModule, canOpenModule, changePolo, effectivePoloId, hasOpenPartnerDetails, setActiveModule, setIsSearchFocused, setSearchQuery]);

  return { searchTarget, clearSearchTarget, handleSearchResultClick };
};
