import React, { useId, useMemo, useRef, useState } from 'react';
import { Check, Search, UserRound, X } from 'lucide-react';
import { textMatchesSearch } from '../../../../lib/search';
import type { DespesaCredorTipo } from '../despesas/components/DespesaCredorPicker';

type Partner = { id: string; nome: string; cpf_cnpj?: string; tipo: string };
const types = new Set(['Aluno', 'Professor', 'PF', 'PJ']);

export function findPdvPartners(partners: Partner[], search: string) {
  if (search.trim().length < 2) return [];
  return partners.filter(partner => types.has(partner.tipo)
    && textMatchesSearch(search, [partner.nome, partner.cpf_cnpj])).slice(0, 8);
}

export function PdvPartnerSearch({ partners, value, onSelect, loading, failed, onRetry }: {
  partners: Partner[]; value: string;
  onSelect: (id: string, type: DespesaCredorTipo | '') => void;
  loading: boolean; failed: boolean; onRetry: () => void;
}) {
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = partners.find(partner => partner.id === value);
  const results = useMemo(() => findPdvPartners(partners, search), [partners, search]);
  const choose = (partner: Partner) => {
    onSelect(partner.id, partner.tipo as DespesaCredorTipo);
    setSearch(''); setActive(-1);
  };
  if (selected) return (
    <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-700 text-white"><UserRound size={22} /></span>
      <div className="min-w-0 flex-1"><p className="truncate font-bold text-[#001a33]">{selected.nome}</p>
        <p className="mt-1 text-xs text-emerald-800">{selected.tipo} · Cadastro selecionado</p></div>
      <button type="button" onClick={() => { onSelect('', ''); setSearch(''); }} className="rounded-xl p-3 text-emerald-800 hover:bg-emerald-100" aria-label="Trocar pagador"><X size={18} /></button>
    </div>
  );
  return (
    <div>
      <label htmlFor={`${listId}-input`} className="mb-3 block text-sm font-bold text-slate-700">Quem vai pagar?</label>
      <div className="relative">
        <Search size={21} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input ref={inputRef} id={`${listId}-input`} type="search" autoFocus autoComplete="off"
          role="combobox" aria-autocomplete="list" aria-expanded={results.length > 0} aria-controls={listId}
          aria-activedescendant={active >= 0 && results[active] ? `${listId}-${active}` : undefined}
          placeholder="Digite o nome do aluno ou parceiro" value={search}
          onChange={event => { setSearch(event.target.value); setActive(-1); }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setActive(current => (current + 1) % results.length); }
            if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setActive(current => current < 0 ? results.length - 1 : (current + results.length - 1) % results.length); }
            if (event.key === 'Enter') { event.preventDefault(); if (active >= 0 && results[active]) choose(results[active]); }
            if (event.key === 'Escape' && search) { event.stopPropagation(); setSearch(''); setActive(-1); }
          }}
          className="h-16 w-full rounded-2xl border border-slate-200 bg-white pl-14 pr-5 text-base text-[#001a33] outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10" />
      </div>
      {failed ? <p role="alert" className="mt-3 text-sm text-rose-700">Não foi possível carregar os cadastros. <button type="button" onClick={onRetry} className="font-bold underline">Tentar novamente</button></p>
        : loading ? <p role="status" className="mt-3 text-sm text-slate-500">Carregando cadastros...</p>
        : results.length ? <ul id={listId} role="listbox" aria-label="Pagadores encontrados" className="mt-3 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-lg shadow-slate-900/5">
          {results.map((partner, index) => <li key={partner.id} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
            <button type="button" tabIndex={-1} onClick={() => choose(partner)} onMouseEnter={() => setActive(index)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left ${active === index ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
              <UserRound size={18} className="shrink-0 text-slate-400" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-[#001a33]">{partner.nome}</span>
                <span className="mt-1 block text-xs text-slate-500">{partner.tipo}{partner.cpf_cnpj ? ` · documento final ${partner.cpf_cnpj.replace(/\D/g, '').slice(-4)}` : ''}</span></span>
              {active === index && <Check size={16} className="text-emerald-700" />}
            </button>
          </li>)}
        </ul> : <p className="mt-3 text-xs text-slate-500">{search.trim().length >= 2 ? 'Nenhum cadastro encontrado. Confira o nome ou busque pelo CPF/CNPJ.' : 'Busque pelo nome ou CPF/CNPJ e selecione o cadastro.'}</p>}
    </div>
  );
}
