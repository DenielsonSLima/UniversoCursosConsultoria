import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FilePenLine,
  FileQuestion,
  Loader2,
  RefreshCw,
  Save,
} from 'lucide-react';

import ToastNotification, { useToast } from '../../gestor/parceiros/components/shared/ToastNotification';
import {
  dirtyPlanoCursoEditorSession,
  emptyPlanoCursoEditorSession,
  hydratedPlanoCursoEditorSession,
  reconcilePlanoCursoEditorSession,
} from './plano-curso-editor-session';
import {
  useConcludeProfessorPlanoCurso,
  useProfessorPlanoCursoWorkspace,
  useProfessorPlanosCurso,
  useSaveProfessorPlanoCurso,
} from '../../shared/plano-curso/plano-curso.hooks';
import { usePlanoCursoRealtime } from '../../shared/plano-curso/plano-curso.realtime';
import type {
  PlanoCursoProfessorResumo,
  PlanoCursoSaveInput,
  PlanoCursoStatus,
  PlanoCursoWorkspace,
} from '../../shared/plano-curso/plano-curso.types';

interface PlanoCursoPageProps {
  professorId: string;
  poloId: string;
}

interface SelectedAssignment {
  turmaId: string;
  disciplinaId: string;
}

const STATUS_VIEW: Record<PlanoCursoStatus, {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  className: string;
}> = {
  AUSENTE: {
    label: 'Não iniciado',
    icon: FileQuestion,
    className: 'bg-slate-100 text-slate-600 ring-slate-200',
  },
  RASCUNHO: {
    label: 'Rascunho',
    icon: FilePenLine,
    className: 'bg-amber-50 text-amber-700 ring-amber-200',
  },
  CONCLUIDO: {
    label: 'Concluído',
    icon: BadgeCheck,
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
};

const resolveErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || '');
  }
  return 'Não foi possível concluir a operação.';
};

const linesToItems = (value: string) => value
  .split('\n')
  .map((item) => item.trim())
  .filter(Boolean);

const PlanoStatusBadge: React.FC<{ status: PlanoCursoStatus }> = ({ status }) => {
  const view = STATUS_VIEW[status];
  const Icon = view.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ring-1 ${view.className}`}>
      <Icon size={12} /> {view.label}
    </span>
  );
};

const PlanoListCard: React.FC<{
  plano: PlanoCursoProfessorResumo;
  onOpen: () => void;
}> = ({ plano, onOpen }) => (
  <article className="group flex min-h-[250px] flex-col rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-purple-200 hover:shadow-xl hover:shadow-purple-950/5">
    <div className="flex items-start justify-between gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-50 text-purple-650">
        <ClipboardList size={20} />
      </div>
      <PlanoStatusBadge status={plano.status} />
    </div>
    <h3 className="mt-4 text-base font-black leading-snug text-[#001a33] group-hover:text-purple-700">
      {plano.disciplinaNome}
    </h3>
    <p className="mt-1 text-[11px] font-bold text-slate-500">{plano.cursoNome}</p>
    <p className="mt-1 text-[10px] font-semibold text-slate-400">
      {plano.turmaNome} · {plano.turmaCodigo}
    </p>
    <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <div>
        <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Dias letivos</p>
        <p className="mt-1 text-sm font-black text-[#001a33]">{plano.totalDias}</p>
      </div>
      <div>
        <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Aulas planejadas</p>
        <p className="mt-1 text-sm font-black text-[#001a33]">{plano.totalAulas}</p>
      </div>
    </div>
    <button
      type="button"
      onClick={onOpen}
      className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-3 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-purple-700 focus:outline-none focus:ring-4 focus:ring-purple-100"
    >
      {plano.status === 'CONCLUIDO' ? <BookOpenCheck size={14} /> : <FilePenLine size={14} />}
      {plano.status === 'CONCLUIDO' ? 'Consultar plano' : 'Preencher plano'}
      <ChevronRight size={14} />
    </button>
  </article>
);

const PlanoCursoPage: React.FC<PlanoCursoPageProps> = ({ professorId, poloId }) => {
  const { toasts, removeToast, toast } = useToast();
  const [selected, setSelected] = useState<SelectedAssignment | null>(null);
  const [objetivosText, setObjetivosText] = useState('');
  const [criteriosText, setCriteriosText] = useState('');
  const [insumosText, setInsumosText] = useState('');
  const [conteudos, setConteudos] = useState<Record<string, string>>({});
  const [editorBaseRevision, setEditorBaseRevision] = useState<number | null>(null);
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [hasRemoteConflict, setHasRemoteConflict] = useState(false);
  const editorSessionRef = useRef(emptyPlanoCursoEditorSession());

  const listQuery = useProfessorPlanosCurso(professorId, poloId);
  const workspaceQuery = useProfessorPlanoCursoWorkspace(
    professorId,
    poloId,
    selected?.turmaId || '',
    selected?.disciplinaId || '',
  );
  usePlanoCursoRealtime({ professorId, poloId });

  const saveMutation = useSaveProfessorPlanoCurso({
    professorId,
    poloId,
    onError: (error) => toast.error('Plano não salvo', resolveErrorMessage(error)),
  });
  const concludeMutation = useConcludeProfessorPlanoCurso({
    professorId,
    poloId,
    onError: (error) => toast.error('Plano não concluído', resolveErrorMessage(error)),
  });

  const workspace = workspaceQuery.data || null;
  const isMutating = saveMutation.isPending || concludeMutation.isPending;

  const markEditorDirty = useCallback(() => {
    editorSessionRef.current = dirtyPlanoCursoEditorSession(editorSessionRef.current);
    setIsEditorDirty(true);
  }, []);

  const hydrateEditor = useCallback((current: PlanoCursoWorkspace) => {
    editorSessionRef.current = hydratedPlanoCursoEditorSession(
      `${current.turmaId}:${current.disciplinaId}`,
      current.revisao,
    );
    setEditorBaseRevision(current.revisao);
    setIsEditorDirty(false);
    setHasRemoteConflict(false);
    setObjetivosText(current.objetivos.join('\n'));
    setCriteriosText(current.criteriosAvaliacao.join('\n'));
    setInsumosText(current.insumosRecursos.join('\n'));
    setConteudos(Object.fromEntries(
      current.aulas.map((aula) => [aula.aulaId, aula.conteudo]),
    ));
  }, []);

  useEffect(() => {
    setSelected(null);
  }, [poloId, professorId]);

  useEffect(() => {
    if (!workspace) return;
    const identity = `${workspace.turmaId}:${workspace.disciplinaId}`;
    const reconciliation = reconcilePlanoCursoEditorSession(
      editorSessionRef.current,
      identity,
      workspace.revisao,
    );
    if (reconciliation.action === 'HYDRATE') {
      hydrateEditor(workspace);
      return;
    }
    if (reconciliation.action === 'PRESERVE') {
      // Outra sessão avançou a revisão. O rascunho local permanece intacto e
      // não pode ser salvo com a revisão nova do cache.
      editorSessionRef.current = reconciliation.session;
      setHasRemoteConflict(true);
    }
  }, [hydrateEditor, workspace]);

  const buildSaveInput = (
    current: PlanoCursoWorkspace,
    expectedRevision: number,
  ): PlanoCursoSaveInput => ({
    turmaId: current.turmaId,
    disciplinaId: current.disciplinaId,
    expectedRevision,
    objetivos: linesToItems(objetivosText),
    criteriosAvaliacao: linesToItems(criteriosText),
    insumosRecursos: linesToItems(insumosText),
    conteudosAulas: current.aulas
      .map((aula) => ({
        aulaId: aula.aulaId,
        conteudo: conteudos[aula.aulaId]?.trim() || '',
      }))
      .filter((item) => item.conteudo.length > 0),
  });

  const reconcileMutationFailure = async () => {
    const result = await workspaceQuery.refetch();
    const session = editorSessionRef.current;
    if (
      result.data
      && session.baseRevision !== null
      && result.data.revisao !== session.baseRevision
      && session.dirty
    ) {
      editorSessionRef.current = { ...session, conflict: true };
      setHasRemoteConflict(true);
    }
  };

  const handleDiscardAndReload = async () => {
    if (isMutating) return;
    const result = await workspaceQuery.refetch();
    if (result.data) hydrateEditor(result.data);
  };

  const handleSave = async () => {
    const baseRevision = editorSessionRef.current.baseRevision;
    if (
      !workspace
      || !workspace.canEdit
      || isMutating
      || hasRemoteConflict
      || baseRevision === null
    ) return;
    try {
      const saved = await saveMutation.mutateAsync(buildSaveInput(workspace, baseRevision));
      hydrateEditor(saved);
      toast.success('Rascunho salvo', 'O Plano de Curso foi atualizado com os dados confirmados pelo servidor.');
    } catch {
      // O callback da mutation apresenta o erro canônico e mantém o formulário aberto.
      void reconcileMutationFailure();
    }
  };

  const handleConclude = async () => {
    const baseRevision = editorSessionRef.current.baseRevision;
    if (
      !workspace
      || !workspace.canEdit
      || isMutating
      || hasRemoteConflict
      || baseRevision === null
    ) return;
    try {
      const saved = await saveMutation.mutateAsync(buildSaveInput(workspace, baseRevision));
      hydrateEditor(saved);
      const concluded = await concludeMutation.mutateAsync({
        planoId: saved.planoId,
        turmaId: saved.turmaId,
        disciplinaId: saved.disciplinaId,
        expectedRevision: saved.revisao,
      });
      hydrateEditor(concluded);
      toast.success('Plano concluído', 'O Plano de Curso foi validado e concluído pelo servidor.');
    } catch {
      // As mutations exibem o erro canônico e mantêm o formulário aberto.
      void reconcileMutationFailure();
    }
  };

  const plans = listQuery.data || [];
  const statusCounts = useMemo(() => plans.reduce((counts, plano) => ({
    ...counts,
    [plano.status]: counts[plano.status] + 1,
  }), { AUSENTE: 0, RASCUNHO: 0, CONCLUIDO: 0 } as Record<PlanoCursoStatus, number>), [plans]);

  if (listQuery.isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center" role="status">
        <Loader2 size={32} className="animate-spin text-purple-650" />
        <span className="ml-3 text-xs font-black uppercase tracking-wider text-slate-500">Carregando planos...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {!selected ? (
        <>
          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-black uppercase tracking-tight text-[#001a33]">
                <BookOpenCheck className="text-purple-600" /> Plano de Curso
              </h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Somente disciplinas atribuídas a você e com encontros planejados aparecem neste módulo.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(STATUS_VIEW) as PlanoCursoStatus[]).map((status) => (
                <div key={status} className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">{STATUS_VIEW[status].label}</p>
                  <p className="mt-0.5 text-sm font-black text-[#001a33]">{statusCounts[status]}</p>
                </div>
              ))}
            </div>
          </header>

          {listQuery.isError ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm font-bold text-red-700" role="alert">
              <div className="flex items-start gap-3">
                <AlertTriangle size={19} className="shrink-0" />
                <div>
                  <p>Não foi possível carregar os Planos de Curso autorizados.</p>
                  <button type="button" onClick={() => { void listQuery.refetch(); }} disabled={listQuery.isFetching} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-[10px] font-black uppercase disabled:opacity-50">
                    <RefreshCw size={13} className={listQuery.isFetching ? 'animate-spin' : ''} /> Tentar novamente
                  </button>
                </div>
              </div>
            </div>
          ) : plans.length === 0 ? (
            <div className="rounded-[2.5rem] border border-slate-100 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
                <CalendarDays size={28} />
              </div>
              <h3 className="mt-4 text-base font-black text-[#001a33]">Nenhum plano disponível</h3>
              <p className="mx-auto mt-1 max-w-lg text-xs font-medium leading-relaxed text-slate-500">
                A disciplina aparecerá aqui depois que a Gestão atribuir você como docente e planejar os encontros da grade.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {plans.map((plano) => (
                <PlanoListCard
                  key={`${plano.turmaId}-${plano.disciplinaId}`}
                  plano={plano}
                  onOpen={() => setSelected({ turmaId: plano.turmaId, disciplinaId: plano.disciplinaId })}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <button type="button" onClick={() => setSelected(null)} disabled={isMutating} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 shadow-sm transition hover:border-purple-200 hover:text-purple-700 disabled:opacity-50">
            <ArrowLeft size={14} /> Voltar aos planos
          </button>

          {workspaceQuery.isLoading ? (
            <div className="flex min-h-[360px] items-center justify-center"><Loader2 size={30} className="animate-spin text-purple-650" /></div>
          ) : workspaceQuery.isError || !workspace ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm font-bold text-red-700" role="alert">
              Não foi possível abrir o Plano de Curso autorizado.
            </div>
          ) : (
            <div className="space-y-5">
              <header className="rounded-[2rem] border border-purple-100 bg-gradient-to-br from-white to-purple-50/50 p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><PlanoStatusBadge status={workspace.status} /></div>
                    <h2 className="mt-3 text-xl font-black text-[#001a33]">{workspace.disciplinaNome}</h2>
                    <p className="mt-1 text-xs font-bold text-slate-500">{workspace.cursoNome}</p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">{workspace.turmaNome} · {workspace.turmaCodigo} · {workspace.poloNome}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {workspace.canEdit ? (
                      <>
                        <button type="button" onClick={() => { void handleSave(); }} disabled={isMutating || hasRemoteConflict} className="inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-purple-700 transition hover:bg-purple-100 disabled:opacity-50">
                          {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar rascunho
                        </button>
                        <button type="button" onClick={() => { void handleConclude(); }} disabled={isMutating || hasRemoteConflict} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50">
                          {concludeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Concluir plano
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-purple-100 pt-4 sm:grid-cols-4">
                  <div><p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Docente</p><p className="mt-1 truncate text-xs font-black text-[#001a33]">{workspace.professorNome}</p></div>
                  <div><p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Dias letivos</p><p className="mt-1 text-xs font-black text-[#001a33]">{workspace.totalDias}</p></div>
                  <div><p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Aulas</p><p className="mt-1 text-xs font-black text-[#001a33]">{workspace.totalAulas}</p></div>
                  <div><p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Revisão da edição</p><p className="mt-1 text-xs font-black text-[#001a33]">{editorBaseRevision ?? workspace.revisao}{isEditorDirty ? ' · não salva' : ''}</p></div>
                </div>
              </header>

              {hasRemoteConflict ? (
                <div className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 sm:flex-row sm:items-center sm:justify-between" role="alert">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={19} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide">Este plano foi alterado em outra sessão</p>
                      <p className="mt-1 text-[10px] font-semibold leading-relaxed text-amber-800">
                        Seu rascunho local foi preservado. Salvar e concluir estão bloqueados para não sobrescrever a revisão {workspace.revisao}. Carregar a versão atual descarta este rascunho.
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={() => { void handleDiscardAndReload(); }} disabled={workspaceQuery.isFetching || isMutating} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-900 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-50">
                    <RefreshCw size={13} className={workspaceQuery.isFetching ? 'animate-spin' : ''} /> Carregar versão atual
                  </button>
                </div>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-3">
                {[
                  { id: 'objetivos', label: 'Objetivos', value: objetivosText, setter: setObjetivosText, help: 'Um objetivo por linha.' },
                  { id: 'criterios', label: 'Critérios de avaliação', value: criteriosText, setter: setCriteriosText, help: 'Um critério por linha.' },
                  { id: 'insumos', label: 'Insumos e recursos', value: insumosText, setter: setInsumosText, help: 'Um recurso por linha.' },
                ].map((field) => (
                  <label key={field.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <span className="text-xs font-black uppercase tracking-wide text-[#001a33]">{field.label}</span>
                    <span className="mt-0.5 block text-[9px] font-semibold text-slate-400">{field.help}</span>
                    <textarea value={field.value} onChange={(event) => { field.setter(event.target.value); markEditorDirty(); }} disabled={!workspace.canEdit || isMutating} rows={7} className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium leading-relaxed text-slate-700 outline-none transition focus:border-purple-400 focus:bg-white focus:ring-4 focus:ring-purple-50 disabled:cursor-not-allowed disabled:opacity-70" />
                  </label>
                ))}
              </div>

              <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-[#001a33]">Conteúdo por encontro</h3>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">Datas, horários, sessões e ordem são os dados canônicos planejados pela Gestão.</p>
                  </div>
                  <span className="rounded-full bg-purple-50 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-purple-700">{workspace.aulas.length} aulas</span>
                </div>
                <div className="mt-4 space-y-3">
                  {workspace.aulas.map((aula) => (
                    <div key={aula.aulaId} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 lg:grid-cols-[220px_1fr]">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-wider text-purple-700">{aula.dataExibicao}</p>
                        <p className="mt-1 text-xs font-black text-[#001a33]">{aula.titulo}</p>
                        <p className="mt-2 text-[9px] font-bold text-slate-400">
                          {[aula.horaInicio && aula.horaFim ? `${aula.horaInicio}–${aula.horaFim}` : aula.horaInicio || aula.horaFim, aula.sessao].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <label>
                        <span className="sr-only">Conteúdo da aula de {aula.dataExibicao}</span>
                        <textarea value={conteudos[aula.aulaId] || ''} onChange={(event) => { setConteudos((current) => ({ ...current, [aula.aulaId]: event.target.value })); markEditorDirty(); }} disabled={!workspace.canEdit || isMutating} rows={3} placeholder="Descreva o conteúdo programático deste encontro" className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium leading-relaxed text-slate-700 outline-none transition focus:border-purple-400 focus:ring-4 focus:ring-purple-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-80" />
                      </label>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </>
      )}

      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default PlanoCursoPage;
