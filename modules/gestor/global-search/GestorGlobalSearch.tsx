import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpenCheck,
  Building2,
  ChevronRight,
  GraduationCap,
  IdCard,
  LoaderCircle,
  MapPin,
  Presentation,
  RefreshCw,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import {
  formatGlobalSearchClass,
  formatGlobalSearchDocument,
  formatGlobalSearchPolo,
} from './gestor-global-search.model';
import type {
  GestorGlobalSearchEntityType,
  GestorGlobalSearchResult,
} from './gestor-global-search.types';

interface GestorGlobalSearchProps {
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
  onSelect: (result: GestorGlobalSearchResult) => void | Promise<void>;
}

const typeStyles: Record<GestorGlobalSearchEntityType, string> = {
  Aluno: 'border-blue-100 bg-blue-50 text-blue-700',
  Professor: 'border-violet-100 bg-violet-50 text-violet-700',
  PF: 'border-slate-200 bg-slate-100 text-slate-700',
  PJ: 'border-amber-100 bg-amber-50 text-amber-700',
};

const entityIcon = (type: GestorGlobalSearchEntityType) => {
  if (type === 'Aluno') return <GraduationCap size={18} aria-hidden="true" />;
  if (type === 'Professor') return <Presentation size={18} aria-hidden="true" />;
  if (type === 'PJ') return <Building2 size={18} aria-hidden="true" />;
  return <UserRound size={18} aria-hidden="true" />;
};

const GestorGlobalSearch: React.FC<GestorGlobalSearchProps> = ({
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
  onSelect,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = 'gestor-global-search-results';
  const isOpen = isSearchAvailable && isSearchFocused && Boolean(searchQuery.trim());
  const hasResultList = isOpen && isSearchReady && !isSearchLoading
    && !isSearchError && searchResults.length > 0;

  useEffect(() => {
    setActiveIndex(searchResults.length ? 0 : -1);
  }, [searchQuery, searchResults]);

  useEffect(() => {
    const activeResult = searchResults[activeIndex];
    if (!hasResultList || !activeResult) return;
    document.getElementById(`${listboxId}-${activeResult.key}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, hasResultList, searchResults]);

  const statusMessage = useMemo(() => {
    if (!isSearchReady) return 'Digite ao menos 2 caracteres para pesquisar.';
    if (isSearchLoading) return 'Buscando nos polos autorizados...';
    if (isSearchError) return 'A busca está indisponível no momento.';
    if (!searchResults.length) return 'Nenhum cadastro encontrado nos seus polos.';
    return `${searchResults.length} ${searchResults.length === 1 ? 'cadastro encontrado' : 'cadastros encontrados'}.`;
  }, [isSearchError, isSearchLoading, isSearchReady, searchResults.length]);

  const chooseResult = (result: GestorGlobalSearchResult) => {
    setIsSearchFocused(false);
    void onSelect(result);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setIsSearchFocused(false);
      inputRef.current?.blur();
      return;
    }
    if (!searchResults.length || isSearchLoading || isSearchError) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % searchResults.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? searchResults.length - 1 : current - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      chooseResult(searchResults[activeIndex]);
    }
  };

  return (
    <div
      className="relative mx-3 flex-1 lg:mx-4 lg:max-w-xl"
      title={isSearchAvailable ? undefined : 'Seu perfil não possui acesso ao módulo Parceiros.'}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsSearchFocused(false);
        }
      }}
    >
      <div className={`flex min-h-12 items-center rounded-2xl border px-4 transition-all ${
        isSearchFocused
          ? 'border-blue-500 bg-white shadow-[0_0_0_3px_rgba(59,130,246,0.12)]'
          : `border-slate-200 bg-slate-50 ${isSearchAvailable ? 'hover:border-slate-300' : 'opacity-70'}`
      }`}>
        <Search size={18} className="mr-3 shrink-0 text-slate-400" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          role="combobox"
          aria-label="Buscar alunos, professores e parceiros"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={hasResultList ? listboxId : undefined}
          aria-activedescendant={hasResultList && searchResults[activeIndex]
            ? `${listboxId}-${searchResults[activeIndex].key}`
            : undefined}
          autoComplete="off"
          placeholder={isSearchAvailable ? 'Buscar pessoa, CPF ou CNPJ...' : 'Busca global sem acesso'}
          disabled={!isSearchAvailable}
          className="min-w-0 flex-1 border-none bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:font-medium placeholder:text-slate-400"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onFocus={() => setIsSearchFocused(true)}
          onKeyDown={handleKeyDown}
        />
        {searchQuery ? (
          <button
            type="button"
            aria-label="Limpar busca global"
            title="Limpar busca"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setSearchQuery('');
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
            className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <span className="sr-only" aria-live="polite">{statusMessage}</span>

      {isOpen ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-full min-w-[min(92vw,30rem)] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50/60 px-4 py-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Busca global</p>
              <p className="mt-0.5 text-xs font-semibold text-slate-600">Resultados em todos os seus polos</p>
            </div>
            {isSearchReady && !isSearchLoading && !isSearchError ? (
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500">
                {searchResults.length}
              </span>
            ) : null}
          </div>

          {!isSearchReady ? (
            <div className="px-5 py-7 text-center text-sm font-medium text-slate-500">
              Digite ao menos 2 caracteres para pesquisar.
            </div>
          ) : isSearchLoading ? (
            <div role="status" className="flex items-center justify-center gap-3 px-5 py-8 text-sm font-semibold text-slate-600">
              <LoaderCircle size={20} className="animate-spin text-blue-600" aria-hidden="true" />
              Buscando nos polos autorizados...
            </div>
          ) : isSearchError ? (
            <div role="alert" className="flex flex-col items-center gap-3 px-5 py-7 text-center">
              <p className="text-sm font-semibold text-slate-700">Não foi possível concluir a busca.</p>
              <button type="button" onClick={retrySearch} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <RefreshCw size={14} aria-hidden="true" /> Tentar novamente
              </button>
            </div>
          ) : searchResults.length ? (
            <div id={listboxId} role="listbox" className="custom-scrollbar max-h-[26rem] space-y-1 overflow-y-auto p-2">
              {searchResults.map((result, index) => {
                const classLabel = formatGlobalSearchClass(result);
                const active = index === activeIndex;
                return (
                  <button
                    key={result.key}
                    id={`${listboxId}-${result.key}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseResult(result)}
                    className={`group flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      active
                        ? 'border-blue-200 bg-blue-50/80 shadow-sm'
                        : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span aria-hidden="true" className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${typeStyles[result.entityType]}`}>
                      {entityIcon(result.entityType)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-extrabold text-slate-950" title={result.name}>{result.name}</span>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${typeStyles[result.entityType]}`}>
                          {result.entityType}
                        </span>
                      </span>
                      <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-700">
                        <span className="inline-flex items-center gap-1 tabular-nums"><IdCard size={12} className="text-slate-400" aria-hidden="true" />{formatGlobalSearchDocument(result.document)}</span>
                        <span className="text-slate-300" aria-hidden="true">•</span>
                        <span className="inline-flex min-w-0 items-center gap-1"><MapPin size={12} className="shrink-0 text-blue-500" aria-hidden="true" /><span className="truncate">{formatGlobalSearchPolo(result)}</span></span>
                      </span>
                      {classLabel ? (
                        <span className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-blue-700">
                          <BookOpenCheck size={12} className="shrink-0" aria-hidden="true" />
                          <span className="truncate" title={classLabel}>Turma · {classLabel}</span>
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight size={16} className={`mt-3 shrink-0 transition-transform ${active ? 'translate-x-0.5 text-blue-600' : 'text-slate-300'}`} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-sm font-bold text-slate-700">Nenhum cadastro encontrado</p>
              <p className="mt-1 text-xs text-slate-500">Tente outro nome, CPF ou CNPJ.</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default GestorGlobalSearch;
