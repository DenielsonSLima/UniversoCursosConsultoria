import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Search from 'lucide-react/dist/esm/icons/search';
import {
  banesePollingQueryKey,
  consultaApiBaneseService,
} from './consulta-api-banese.service';
import type { BanesePollingRun } from './consulta-api-banese.types';

const operationalDateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Maceio',
  }).format(new Date(value))
  : '—';

const duration = (milliseconds?: number | null) => {
  if (milliseconds === null || milliseconds === undefined) return '—';
  if (milliseconds < 1000) return `${milliseconds} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
};

const statusTone = (status: string) => {
  if (status === 'SUCCESS') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['FAILED', 'THROTTLED', 'ABANDONED'].includes(status)) return 'border-red-200 bg-red-50 text-red-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

const RunDetails = ({ runs }: { runs: BanesePollingRun[] }) => (
  <div className="overflow-x-auto border-t border-slate-100">
    <table className="min-w-full text-left text-[11px]">
      <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-400">
        <tr>
          <th className="px-4 py-2">Início</th>
          <th className="px-4 py-2">Perfil</th>
          <th className="px-4 py-2">Resultado</th>
          <th className="px-4 py-2">Consultados</th>
          <th className="px-4 py-2">Pagos</th>
          <th className="px-4 py-2">Erros</th>
          <th className="px-4 py-2">OAuth</th>
          <th className="px-4 py-2">Duração</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 bg-white text-slate-600">
        {runs.map((run) => (
          <tr key={run.id}>
            <td className="whitespace-nowrap px-4 py-2 font-bold">{operationalDateTime(run.started_at)}</td>
            <td className="px-4 py-2 font-black text-[#001a33]">P{run.profile_id}</td>
            <td className="px-4 py-2">
              <span className={`inline-flex rounded-full border px-2 py-1 text-[8px] font-black uppercase ${statusTone(run.status)}`}>
                {run.status}
              </span>
            </td>
            <td className="px-4 py-2">{run.checked}/{run.claimed}</td>
            <td className="px-4 py-2 font-bold text-emerald-700">{run.paid}</td>
            <td className="px-4 py-2 font-bold text-red-600">{run.failed}</td>
            <td className="px-4 py-2">{run.oauth_requests} nova(s){run.oauth_reused ? ' • reutilizado' : ''}</td>
            <td className="px-4 py-2">{duration(run.duration_ms)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const BaneseRunsPanel = ({ active }: { active: boolean }) => {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [startedFrom, setStartedFrom] = useState('');
  const [startedTo, setStartedTo] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => setPage(1), [startedFrom, startedTo, errorsOnly]);

  const invalidRange = Boolean(startedFrom && startedTo && startedFrom > startedTo);
  const filters = {
    page,
    search,
    startedFrom: startedFrom ? new Date(`${startedFrom}T00:00:00-03:00`).toISOString() : undefined,
    startedTo: startedTo ? new Date(`${startedTo}T23:59:59.999-03:00`).toISOString() : undefined,
    errorsOnly,
  };
  const runsQuery = useQuery({
    queryKey: [...banesePollingQueryKey, 'runs', filters],
    queryFn: () => consultaApiBaneseService.getRunsPage(filters),
    enabled: active && !invalidRange,
    placeholderData: keepPreviousData,
  });
  const result = invalidRange ? undefined : runsQuery.data;

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setStartedFrom('');
    setStartedTo('');
    setErrorsOnly(false);
    setPage(1);
  };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_auto_auto]">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            Pesquisar
            <span className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-blue-500">
              <Search size={16} className="text-slate-400" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="P2, status ou decisão"
                className="w-full bg-transparent text-xs font-semibold normal-case tracking-normal outline-none"
              />
            </span>
          </label>
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            Data inicial
            <input
              type="date"
              value={startedFrom}
              onChange={(event) => setStartedFrom(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-xs font-semibold normal-case tracking-normal outline-none focus:border-blue-500"
            />
          </label>
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            Data final
            <input
              type="date"
              value={startedTo}
              onChange={(event) => setStartedTo(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-xs font-semibold normal-case tracking-normal outline-none focus:border-blue-500"
            />
          </label>
          <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-[10px] font-black uppercase text-red-700">
            <input type="checkbox" checked={errorsOnly} onChange={(event) => setErrorsOnly(event.target.checked)} />
            Só erros
          </label>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-5 min-h-11 rounded-xl border border-slate-200 px-4 text-[10px] font-black uppercase text-slate-600 hover:border-blue-300 hover:text-blue-700"
          >
            Limpar
          </button>
        </div>
        {invalidRange ? <p className="mt-3 text-xs font-bold text-red-600">A data inicial deve ser anterior à data final.</p> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-black text-[#001a33]">Execuções agrupadas a cada 10 minutos</h3>
          <p className="text-xs font-semibold text-slate-500">
            Cada página reúne até 6 blocos, equivalentes a 60 minutos de operação registrada.
          </p>
        </div>
        <p className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase text-slate-600">
          {result?.totalRuns || 0} execuções no filtro
        </p>
      </div>

      {runsQuery.isFetching ? (
        <div className="flex items-center gap-2 text-xs font-bold text-blue-700"><RefreshCw className="animate-spin" size={15} /> Atualizando histórico...</div>
      ) : null}
      {runsQuery.isError ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">
          {runsQuery.error instanceof Error ? runsQuery.error.message : 'Não foi possível carregar as execuções.'}
        </div>
      ) : null}

      <div className="space-y-3">
        {(result?.items || []).map((group) => (
          <details key={group.window_start} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <summary className="grid cursor-pointer list-none gap-3 p-4 text-xs md:grid-cols-[1.4fr_0.7fr_repeat(5,0.55fr)]">
              <div>
                <p className="font-black text-[#001a33]">
                  {operationalDateTime(group.window_start)} – {operationalDateTime(group.window_end)}
                </p>
                <p className="mt-1 text-[10px] font-semibold text-slate-400">{group.run_count} execução(ões) • clique para detalhar</p>
              </div>
              <div><span className="text-[9px] font-black uppercase text-slate-400">Perfis</span><p className="mt-1 font-black text-[#001a33]">{group.profile_ids.map((id) => `P${id}`).join(', ')}</p></div>
              <div><span className="text-[9px] font-black uppercase text-slate-400">Consultados</span><p className="mt-1 font-black">{group.checked}/{group.claimed}</p></div>
              <div><span className="text-[9px] font-black uppercase text-slate-400">Pagos</span><p className="mt-1 font-black text-emerald-700">{group.paid}</p></div>
              <div><span className="text-[9px] font-black uppercase text-slate-400">Erros</span><p className="mt-1 font-black text-red-600">{group.failed}</p></div>
              <div><span className="text-[9px] font-black uppercase text-slate-400">OAuth</span><p className="mt-1 font-black">{group.oauth_requests} nova(s)</p></div>
              <div><span className="text-[9px] font-black uppercase text-slate-400">Média</span><p className="mt-1 font-black">{duration(group.average_duration_ms)}</p></div>
            </summary>
            <RunDetails runs={group.runs} />
          </details>
        ))}
        {!runsQuery.isLoading && !result?.items.length ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-sm font-semibold text-slate-400">
            Nenhuma execução encontrada neste filtro.
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 px-3 text-[10px] font-black uppercase text-slate-600 disabled:opacity-40"
        >
          <ChevronLeft size={15} /> Mais recentes
        </button>
        <p className="text-center text-[10px] font-black uppercase text-slate-500">
          Página {page} de {Math.max(1, result?.totalPages || 1)}
          <span className="block font-semibold normal-case text-slate-400">60 minutos por página</span>
        </p>
        <button
          type="button"
          disabled={!result?.totalPages || page >= result.totalPages}
          onClick={() => setPage((current) => current + 1)}
          className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 px-3 text-[10px] font-black uppercase text-slate-600 disabled:opacity-40"
        >
          Mais antigos <ChevronRight size={15} />
        </button>
      </div>
    </section>
  );
};
