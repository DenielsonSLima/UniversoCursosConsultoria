export const GESTOR_GLOBAL_SEARCH_MIN_LENGTH = 2;
export const GESTOR_GLOBAL_SEARCH_LIMIT = 12;

export type GestorGlobalSearchEntityType = 'Aluno' | 'Professor' | 'PF' | 'PJ';

export interface GestorGlobalSearchResult {
  key: string;
  partnerId: string;
  entityType: GestorGlobalSearchEntityType;
  name: string;
  document: string | null;
  status: string;
  photoUrl: string | null;
  poloId: string | null;
  poloName: string | null;
  poloCity: string | null;
  poloState: string | null;
  classId: string | null;
  className: string | null;
  classCode: string | null;
  otherClasses: number;
}

export interface GestorGlobalSearchState {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: GestorGlobalSearchResult[];
  isSearchFocused: boolean;
  setIsSearchFocused: (focused: boolean) => void;
  isSearchLoading: boolean;
  isSearchError: boolean;
  isSearchReady: boolean;
  isSearchAvailable: boolean;
  retrySearch: () => void;
}
