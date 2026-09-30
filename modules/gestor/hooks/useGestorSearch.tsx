import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gestorGlobalSearchService } from '../global-search/gestor-global-search.service';
import {
  GESTOR_GLOBAL_SEARCH_MIN_LENGTH,
  type GestorGlobalSearchResult,
  type GestorGlobalSearchState,
} from '../global-search/gestor-global-search.types';

interface UseGestorSearchOptions {
  enabled: boolean;
  accessKey: string;
}

const SEARCH_DEBOUNCE_MS = 320;

export const useGestorSearch = ({
  enabled,
  accessKey,
}: UseGestorSearchOptions): GestorGlobalSearchState => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const normalizedQuery = searchQuery.trim();
  const isSearchReady = normalizedQuery.length >= GESTOR_GLOBAL_SEARCH_MIN_LENGTH;

  useEffect(() => {
    if (!isSearchReady) {
      setDebouncedQuery(normalizedQuery);
      return;
    }
    const timer = window.setTimeout(() => setDebouncedQuery(normalizedQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [isSearchReady, normalizedQuery]);

  const query = useQuery<GestorGlobalSearchResult[]>({
    queryKey: ['gestor-global-search', accessKey, debouncedQuery],
    queryFn: ({ signal }) => gestorGlobalSearchService.search(debouncedQuery, signal),
    enabled: enabled
      && debouncedQuery.length >= GESTOR_GLOBAL_SEARCH_MIN_LENGTH
      && debouncedQuery === normalizedQuery,
    staleTime: 15_000,
    gcTime: 60_000,
    retry: 1,
  });

  const hasSettledTerm = debouncedQuery === normalizedQuery;
  const searchResults = enabled && isSearchReady && hasSettledTerm
    ? query.data || []
    : [];

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearchFocused,
    setIsSearchFocused,
    isSearchLoading: enabled && isSearchReady && (!hasSettledTerm || query.isFetching),
    isSearchError: enabled && isSearchReady && hasSettledTerm && query.isError,
    isSearchReady,
    isSearchAvailable: enabled,
    retrySearch: () => { void query.refetch(); },
  };
};
