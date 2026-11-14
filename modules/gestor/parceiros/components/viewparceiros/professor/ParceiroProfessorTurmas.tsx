import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { supabase } from '../../../../../../lib/supabase';
import { createRealtimeInvalidationController } from '../../../../../shared/realtime/realtime-invalidation';
import InstitutionalSelect from '../../../../../shared/components/InstitutionalSelect';
import { loadProfessorAssignments, PROFESSOR_ASSIGNMENTS_PAGE_SIZE, type AssignmentStatus } from './professor-turmas.service';

interface Props { professorId: string; poloId?: string | null; cacheScope?: string }
const date = (value: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informada';
const label = (value?: string | null) => value?.replaceAll('_', ' ').toLocaleLowerCase('pt-BR') || 'Não informado';

export default function ParceiroProfessorTurmas({ professorId, poloId, cacheScope }: Props) {
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<AssignmentStatus>('todas');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  useEffect(() => { setPage(0); }, [professorId, poloId, cacheScope]);
  const query = useQuery({
    queryKey: ['gestor-professor-turmas', professorId, poloId, cacheScope, status, appliedSearch, page],
    queryFn: () => loadProfessorAssignments({ professorId, poloId, status, page, turmaSearch: appliedSearch }),
    enabled: Boolean(professorId && cacheScope),
    staleTime: 0,
    gcTime: 0,
    retry: 2,
    refetchOnReconnect: 'always',
  });
  useEffect(() => {
    if (query.data) setPage((current) => Math.min(current, Math.max(0, Math.ceil(query.data.count / PROFESSOR_ASSIGNMENTS_PAGE_SIZE) - 1)));
  }, [query.data?.count]);
  useEffect(() => {
    if (!professorId || !cacheScope) return undefined;
    const invalidation = createRealtimeInvalidationController({ invalidate: () => client.invalidateQueries({
      queryKey: ['gestor-professor-turmas', professorId, poloId, cacheScope],
    }) });
    const channel = supabase.channel(`gestor-professor-vinculos:${professorId}:${poloId || 'global'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turmas_disciplinas' }, invalidation.schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turmas', ...(poloId ? { filter: `polo_id=eq.${poloId}` } : {}) }, invalidation.schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disciplinas' }, invalidation.schedule)
      .subscribe(invalidation.onChannelStatus);
    return () => { invalidation.dispose(); void supabase.removeChannel(channel); };
  }, [professorId, poloId, cacheScope, client]);
  const count = query.data?.count || 0;
  const pages = Math.max(1, Math.ceil(count / PROFESSOR_ASSIGNMENTS_PAGE_SIZE));

  return <section className="space-y-4" aria-label="Turmas e disciplinas do professor">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-[15px] font-medium text-[#122b42]">Turmas e disciplinas</h3>
        <p className="mt-1 text-xs text-slate-500">Vínculos registrados na grade das turmas que seu acesso permite consultar.</p>
      </div>

    </header>
    <div className="grid items-end gap-3 sm:grid-cols-[1fr_210px]">
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setPage(0); setAppliedSearch(search.trim()); }}>
        <label className="min-w-0 flex-1 text-xs text-slate-600">Nome da turma
          <input className="professor-input mt-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar turma" />
        </label>
        <button type="submit" className="professor-action self-end" aria-label="Buscar turma"><Search size={16} /></button>
      </form>
      <div><label className="mb-1 block text-xs text-slate-600" htmlFor="professor-vinculo-status">Situação da disciplina</label>
        <InstitutionalSelect id="professor-vinculo-status" ariaLabel="Situação da disciplina" value={status}
          options={[{ value: 'todas', label: 'Todas' }, { value: 'andamento', label: 'Não concluídas' }, { value: 'concluidas', label: 'Concluídas' }]}
          onValueChange={(value) => { setStatus(value as AssignmentStatus); setPage(0); }} />
      </div>
    </div>
    {query.isPending || !cacheScope ? <p role="status" className="flex items-center gap-2 py-8 text-slate-500"><Loader2 size={16} className="animate-spin" /> Carregando vínculos…</p>
      : query.isError ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">Não foi possível carregar os vínculos. A conexão será retomada automaticamente.</div>
      : <>
        <p className="text-xs text-slate-500" aria-live="polite">{count} vínculo(s) encontrado(s)</p>
        {!query.data.items.length ? <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-slate-500">Nenhuma disciplina vinculada neste filtro. Os vínculos são definidos na grade da turma.</div>
          : <div className="grid gap-3 lg:grid-cols-2">{query.data.items.map((item) => <article key={`${item.turma_id}:${item.disciplina_id}`} className="min-w-0 rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <h4 className="flex min-w-0 items-start gap-2 font-medium text-[#122b42]"><BookOpen size={16} className="mt-0.5 shrink-0 text-blue-600" /><span className="break-words">{item.disciplina?.nome || 'Disciplina não disponível'}</span></h4>
              <span className={`shrink-0 rounded-md px-2 py-1 text-xs ${item.concluida ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{item.concluida ? 'Concluída' : 'Não concluída'}</span>
            </div>
            <p className="mt-3 break-words font-medium">{item.turma.nome} · {item.turma.codigo}</p>
            <p className="mt-1 text-xs text-slate-500">{item.turma.curso?.nome} · {label(item.turma.curso?.modalidade)}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div><dt className="text-slate-500">Carga horária</dt><dd>{item.disciplina?.carga_horaria == null ? 'Não informada' : `${item.disciplina.carga_horaria} h`}</dd></div>
              <div><dt className="text-slate-500">Turma / turno</dt><dd>{label(item.turma.status)} · {label(item.turma.turno)}</dd></div>
              <div><dt className="text-slate-500">Início</dt><dd>{date(item.turma.data_inicio)}</dd></div>
              <div><dt className="text-slate-500">Término previsto</dt><dd>{date(item.turma.data_previsao_termino)}</dd></div>
              {item.periodo && <div className="col-span-2"><dt className="text-slate-500">Período letivo</dt><dd>{item.periodo.nome} · {label(item.periodo.status)}</dd></div>}
            </dl>
            <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">{item.turma.polo?.nome} {item.turma.polo?.cidade ? `· ${item.turma.polo.cidade}/${item.turma.polo.estado || '—'}` : ''}</p>
          </article>)}</div>}
        <nav aria-label="Páginas de vínculos" className="flex items-center justify-end gap-3">
          <button className="professor-action" disabled={page === 0 || query.isFetching} onClick={() => setPage(page - 1)} aria-label="Página anterior"><ChevronLeft size={16} /></button>
          <span className="text-xs text-slate-500">Página {page + 1} de {pages}</span>
          <button className="professor-action" disabled={page + 1 >= pages || query.isFetching} onClick={() => setPage(page + 1)} aria-label="Próxima página"><ChevronRight size={16} /></button>
        </nav>
      </>}
  </section>;
}
