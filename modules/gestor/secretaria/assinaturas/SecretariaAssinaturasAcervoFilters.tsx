import React from 'react';
import { CalendarDays, FilterX, Search } from 'lucide-react';
import type { ElectronicSignatureArchiveFilters } from '../../../shared/assinatura-eletronica/assinatura-eletronica.contract';
import { fieldClassName } from './SecretariaAssinaturasAcervo.shared';

interface ArchiveFiltersFormProps {
  draftFilters: ElectronicSignatureArchiveFilters;
  setDraftFilters: React.Dispatch<
    React.SetStateAction<ElectronicSignatureArchiveFilters>
  >;
  filterError: string | null;
  normalizedPoloId: string | null;
  turmasPending: boolean;
  turmasError: boolean;
  turmas: readonly { id: string; label: string }[];
  activeFilterCount: number;
  hasDraftFilters: boolean;
  onSubmit: (event: React.FormEvent) => void;
  onClear: () => void;
  onRetryTurmas: () => void;
}

export const ArchiveFiltersForm: React.FC<ArchiveFiltersFormProps> = ({
  draftFilters,
  setDraftFilters,
  filterError,
  normalizedPoloId,
  turmasPending,
  turmasError,
  turmas,
  activeFilterCount,
  hasDraftFilters,
  onSubmit,
  onClear,
  onRetryTurmas,
}) => (
        <form onSubmit={onSubmit} className="border-b border-slate-100 bg-slate-50/70 p-5 sm:p-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="md:col-span-2 xl:col-span-1">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Buscar no acervo</span>
              <span className="relative mt-1 block">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={draftFilters.search}
                  maxLength={120}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Título, turma, disciplina, UUID ou signatário"
                  className={`${fieldClassName} pl-10`}
                />
              </span>
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Status</span>
              <select
                value={draftFilters.status}
                onChange={(event) => setDraftFilters((current) => ({
                  ...current,
                  status: event.target.value as ElectronicSignatureArchiveFilters['status'],
                }))}
                className={`mt-1 ${fieldClassName}`}
              >
                <option value="TODOS">Todos</option>
                <option value="ASSINADO">Assinado</option>
                <option value="SUBSTITUIDO">Substituído</option>
              </select>
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Tipo de documento</span>
              <select
                value={draftFilters.documentType || ''}
                onChange={(event) => setDraftFilters((current) => ({
                  ...current,
                  documentType: event.target.value === 'diario_classe' ? 'diario_classe' : null,
                }))}
                className={`mt-1 ${fieldClassName}`}
              >
                <option value="">Todos os tipos disponíveis</option>
                <option value="diario_classe">Diário de classe</option>
                <option value="contrato" disabled>Contrato — assinatura ainda não habilitada</option>
                <option value="matricula" disabled>Matrícula — assinatura ainda não habilitada</option>
              </select>
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Turma</span>
              <select
                value={draftFilters.turmaId || ''}
                onChange={(event) => setDraftFilters((current) => ({
                  ...current,
                  turmaId: event.target.value || null,
                }))}
                disabled={!normalizedPoloId || turmasPending || turmasError}
                className={`mt-1 ${fieldClassName}`}
              >
                <option value="">
                  {!normalizedPoloId
                    ? 'Selecione um polo na gestão'
                    : turmasPending
                      ? 'Carregando turmas…'
                      : turmasError
                        ? 'Turmas indisponíveis'
                        : 'Todas as turmas'}
                </option>
                {turmas.map((turma) => (
                  <option key={turma.id} value={turma.id}>{turma.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Finalizado a partir de</span>
              <span className="relative mt-1 block">
                <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={draftFilters.finalizedFrom || ''}
                  max={draftFilters.finalizedTo || undefined}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, finalizedFrom: event.target.value || null }))}
                  className={`${fieldClassName} pl-10`}
                />
              </span>
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Finalizado até</span>
              <span className="relative mt-1 block">
                <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={draftFilters.finalizedTo || ''}
                  min={draftFilters.finalizedFrom || undefined}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, finalizedTo: event.target.value || null }))}
                  className={`${fieldClassName} pl-10`}
                />
              </span>
            </label>
          </div>
          {filterError ? <p role="alert" className="mt-3 text-xs font-bold text-rose-700">{filterError}</p> : null}
          {turmasError && normalizedPoloId ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold text-amber-800" role="status">
              O filtro de turma está temporariamente indisponível.
              <button type="button" onClick={onRetryTurmas} className="underline underline-offset-4">Tentar novamente</button>
            </div>
          ) : null}
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] font-bold text-slate-500" aria-live="polite">
              {activeFilterCount ? `${activeFilterCount} filtro(s) aplicado(s)` : 'Exibindo todo o acervo autorizado neste escopo.'}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" onClick={onClear} disabled={!activeFilterCount && !hasDraftFilters} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-wide text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
                <FilterX size={14} /> Limpar
              </button>
              <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 text-[10px] font-black uppercase tracking-wide text-white transition hover:bg-blue-900">
                <Search size={14} /> Aplicar filtros
              </button>
            </div>
          </div>
        </form>

);
