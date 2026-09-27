import React, { useId, useMemo, useRef, useState } from 'react';
import { Check, CircleCheckBig, Search, UserRound, X } from 'lucide-react';
import { textMatchesSearch } from '../../../../lib/search';
import type { DespesaCredorTipo } from '../despesas/components/DespesaCredorPicker';

type Partner = { id: string; nome: string; cpf_cnpj?: string; tipo: string };
const types = new Set(['Aluno', 'Professor', 'PF', 'PJ']);

export function maskPdvDocument(value?: string) {
  const digits = String(value || '').replace(/\D/g, '');
  if (![11, 14].includes(digits.length)) return 'CPF/CNPJ não informado';
  const masked = `${digits.slice(0, 2)}${'*'.repeat(digits.length - 5)}${digits.slice(-3)}`;
  if (digits.length === 11) {
    return `CPF ${masked.slice(0, 3)}.${masked.slice(3, 6)}.${masked.slice(6, 9)}-${masked.slice(9)}`;
  }
  return `CNPJ ${masked.slice(0, 2)}.${masked.slice(2, 5)}.${masked.slice(5, 8)}/${masked.slice(8, 12)}-${masked.slice(12)}`;
}

export function findPdvPartners(partners: Partner[], search: string) {
  if (search.trim().length < 2) return [];
  return partners.filter(partner => types.has(partner.tipo)
    && textMatchesSearch(search, [partner.nome, partner.cpf_cnpj])).slice(0, 8);
}

export function PdvPartnerSearch({ partners, value, onSelect, loading, failed, onRetry, location }: {
  partners: Partner[]; value: string;
  onSelect: (id: string, type: DespesaCredorTipo | '') => void;
  loading: boolean; failed: boolean; onRetry: () => void;
  location?: string;
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
    <div className="group relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-blue-50/60 p-4 shadow-[0_12px_32px_-24px_rgba(5,150,105,0.7)] sm:p-5">
      <div className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full bg-emerald-300/15 blur-2xl" aria-hidden="true" />
      <div className="relative flex items-center gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-700 text-white shadow-lg shadow-emerald-700/20"><UserRound size={22} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><p className="truncate font-black text-[#071b3f]">{selected.nome}</p><CircleCheckBig size={16} className="shrink-0 text-emerald-600" /></div>
          <p className="mt-1 text-xs font-medium text-emerald-800">{maskPdvDocument(selected.cpf_cnpj)} <span className="px-1 text-emerald-300">•</span> {location || 'Cidade/UF não informada'}</p>
        </div>
        <button type="button" onClick={() => { onSelect('', ''); setSearch(''); }} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-emerald-200 bg-white/80 text-emerald-800 transition hover:border-emerald-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" aria-label="Trocar pagador"><X size={18} /></button>
      </div>
    </div>
  );

  return (
    <div>
      <label htmlFor={`${listId}-input`} className="sr-only">Quem vai pagar?</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl bg-white text-blue-800 shadow-sm"><Search size={20} /></span>
        <input ref={inputRef} id={`${listId}-input`} type="search" autoFocus autoComplete="off"
          role="combobox" aria-autocomplete="list" aria-expanded={results.length > 0} aria-controls={listId}
          aria-activedescendant={active >= 0 && results[active] ? `${listId}-${active}` : undefined}
          placeholder="Digite o nome, CPF ou CNPJ" value={search}
          onChange={event => { setSearch(event.target.value); setActive(-1); }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setActive(current => (current + 1) % results.length); }
            if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setActive(current => current < 0 ? results.length - 1 : (current + results.length - 1) % results.length); }
            if (event.key === 'Enter') { event.preventDefault(); if (active >= 0 && results[active]) choose(results[active]); }
            if (event.key === 'Escape' && search) { event.stopPropagation(); setSearch(''); setActive(-1); }
          }}
          className="h-[76px] w-full rounded-2xl border border-slate-200 bg-[#f7f9fc] pl-[4.5rem] pr-16 text-base font-semibold text-[#071b3f] outline-none transition-all placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 focus:-translate-y-0.5 focus:border-blue-500 focus:bg-white focus:shadow-[0_16px_40px_-22px_rgba(37,99,235,0.65)] focus:ring-4 focus:ring-blue-500/10" />
        <span className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 sm:block">Buscar</span>
      </div>

      {failed ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">Não foi possível carregar os cadastros. <button type="button" onClick={onRetry} className="font-bold underline">Tentar novamente</button></p>
        : loading ? <p role="status" className="mt-3 flex items-center gap-2 text-sm text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" /> Carregando cadastros...</p>
        : results.length ? <ul id={listId} role="listbox" aria-label="Pagadores encontrados" className="relative z-20 mt-3 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_22px_55px_-22px_rgba(7,27,63,0.35)]">
          {results.map((partner, index) => <li key={partner.id} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
            <button type="button" tabIndex={-1} onClick={() => choose(partner)} onMouseEnter={() => setActive(index)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition sm:px-4 ${active === index ? 'bg-blue-50 ring-1 ring-blue-100' : 'hover:bg-slate-50'}`}>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active === index ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-400'}`}><UserRound size={18} /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-[#071b3f]">{partner.nome}</span>
                <span className="mt-1 block text-xs text-slate-500">{maskPdvDocument(partner.cpf_cnpj)} <span className="px-1 text-slate-300">•</span> {location || 'Cidade/UF não informada'}</span></span>
              {active === index && <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-700 text-white"><Check size={15} /></span>}
            </button>
          </li>)}
        </ul> : <p className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500"><span>{search.trim().length >= 2 ? 'Nenhum cadastro encontrado. Confira o nome ou documento.' : 'A busca começa a partir de 2 caracteres.'}</span><span className="hidden font-semibold text-slate-400 sm:inline">CPF/CNPJ protegido</span></p>}
    </div>
  );
}
