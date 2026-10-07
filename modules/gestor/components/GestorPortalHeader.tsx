import React from 'react';
import { Building, CalendarDays, ChevronDown } from 'lucide-react';
import GestorGlobalSearch from '../global-search/GestorGlobalSearch';
import type { GestorGlobalSearchResult } from '../global-search/gestor-global-search.types';

export interface GestorPoloHeaderOption {
  id: string;
  nome?: string;
  cidade?: string;
  estado?: string;
  cnpj?: string;
  is_matriz?: boolean;
}

interface GestorPortalHeaderProps {
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
  handleSearchResultClick: (result: GestorGlobalSearchResult) => void | Promise<void>;
  isLoadingPolos: boolean;
  currentPolo?: GestorPoloHeaderOption;
  visiblePolos: GestorPoloHeaderOption[];
  currentPoloId: string | null;
  isPoloSelectorOpen: boolean;
  setIsPoloSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handlePoloChange: (poloId: string) => void;
  formattedDate: string;
  formattedDayOfWeek: string;
}

const formatPoloLocation = (polo: GestorPoloHeaderOption) =>
  [polo.cidade, polo.estado].filter(Boolean).join(' - ');

const formatPoloDetails = (polo: GestorPoloHeaderOption) =>
  [polo.cnpj, formatPoloLocation(polo)].filter(Boolean).join(' • ');

const GestorPortalHeader: React.FC<GestorPortalHeaderProps> = ({
  searchQuery,
  setSearchQuery,
  searchResults,
  isSearchFocused,
  setIsSearchFocused,
  isSearchLoading,
  isSearchError,
  isSearchReady,
  isSearchAvailable,
  retrySearch,
  handleSearchResultClick,
  isLoadingPolos,
  currentPolo,
  visiblePolos,
  currentPoloId,
  isPoloSelectorOpen,
  setIsPoloSelectorOpen,
  handlePoloChange,
  formattedDate,
  formattedDayOfWeek,
}) => (
  <header className="sticky top-16 z-30 flex min-h-[84px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6 lg:top-0 lg:px-8">
    <div className="hidden items-center gap-4 xl:flex">
      <h2 className="flex items-center gap-2 text-xl font-bold uppercase tracking-tight text-[#001a33]">
        Portal de Gestão
      </h2>
    </div>

    <GestorGlobalSearch
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      searchResults={searchResults}
      isSearchFocused={isSearchFocused}
      setIsSearchFocused={setIsSearchFocused}
      isSearchLoading={isSearchLoading}
      isSearchError={isSearchError}
      isSearchReady={isSearchReady}
      isSearchAvailable={isSearchAvailable}
      retrySearch={retrySearch}
      onSelect={handleSearchResultClick}
    />

    <div className="flex shrink-0 items-center gap-4 lg:gap-6">
      <div className="relative hidden h-12 w-[19rem] lg:block xl:w-[23rem]">
        {isLoadingPolos || !currentPolo ? (
          <div className="flex h-12 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
            <div className="h-7 w-7 shrink-0 animate-pulse rounded-lg bg-slate-100" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-2.5 w-4/5 rounded-full bg-slate-200/80" />
              <div className="h-2 w-3/5 rounded-full bg-slate-200/70" />
            </div>
          </div>
        ) : (
          <div
            className="h-12 w-full"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setIsPoloSelectorOpen(false);
              }
            }}
          >
            <button
              type="button"
              onClick={() => setIsPoloSelectorOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={isPoloSelectorOpen}
              disabled={visiblePolos.length <= 1}
              className="flex h-12 w-full min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 text-left shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-white"
            >
              <Building size={16} className="shrink-0 text-blue-600" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-xs font-bold tracking-tight text-slate-800">{currentPolo.nome}</span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
                    currentPolo.is_matriz
                      ? 'border-blue-200/50 bg-blue-50 text-blue-600'
                      : 'border-slate-200 bg-slate-100 text-slate-600'
                  }`}>
                    {currentPolo.is_matriz ? 'Matriz' : 'Polo'}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[10px] font-normal text-slate-500">
                  {formatPoloDetails(currentPolo)}
                </span>
              </span>
              <ChevronDown
                size={14}
                className={`shrink-0 text-slate-400 transition-transform ${visiblePolos.length <= 1 ? 'opacity-0' : ''} ${isPoloSelectorOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            {isPoloSelectorOpen ? (
              <div role="listbox" className="absolute right-0 top-full z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-slate-900/15 animate-fadeIn">
                {visiblePolos.map((polo) => {
                  const isSelected = polo.id === currentPoloId;
                  return (
                    <button
                      key={polo.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handlePoloChange(polo.id)}
                      className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${isSelected ? 'bg-blue-50/60 text-blue-900' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span className="flex items-center gap-3">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${isSelected ? 'bg-blue-600' : 'bg-slate-300'}`} />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={`truncate text-xs tracking-tight ${isSelected ? 'font-bold text-blue-900' : 'font-semibold text-slate-700'}`}>{polo.nome}</span>
                            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${polo.is_matriz ? 'bg-blue-100/50 text-blue-700' : 'bg-slate-200/50 text-slate-600'}`}>
                              {polo.is_matriz ? 'Matriz' : 'Polo'}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] font-normal text-slate-500">{formatPoloDetails(polo)}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="hidden h-8 w-px bg-slate-200 sm:block" />
      <div className="hidden items-center gap-2.5 pl-1 text-left 2xl:flex">
        <CalendarDays size={18} className="shrink-0 text-amber-500" aria-hidden="true" />
        <div className="flex flex-col justify-center">
          <span className="text-xs font-bold leading-tight text-slate-800">{formattedDate}</span>
          <span className="mt-0.5 text-[10px] font-medium leading-tight text-slate-400">{formattedDayOfWeek}</span>
        </div>
      </div>
    </div>
  </header>
);

export default GestorPortalHeader;
