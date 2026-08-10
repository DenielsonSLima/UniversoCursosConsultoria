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
import DocumentHeader from '../../gestor/components/DocumentHeader';
import ReportWatermark from '../../gestor/relatorios/components/ReportWatermark';
import type { ProfessorPolo } from '../components/ProfessorShell';
import {
  dirtyPlanoCursoEditorSession,
  emptyPlanoCursoEditorSession,
  hydratedPlanoCursoEditorSession,
  reconcilePlanoCursoEditorSession,
} from './plano-curso-editor-session';
import {
  expandPlanoCursoConteudosByDay,
  groupPlanoCursoAulasByDay,
  paginatePlanoCursoDays,
  PLANO_CURSO_DAYS_PER_PAGE,
  type PlanoCursoDiaEditor,
} from './plano-curso-day-editor';
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
  polo: ProfessorPolo | null;
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

const PlanoCursoPaper: React.FC<{
  children: React.ReactNode;
  pageNumber: number;
  polo: ProfessorPolo | null;
  totalPages: number;
  workspace: PlanoCursoWorkspace;
}> = ({ children, pageNumber, polo, totalPages, workspace }) => {
  const institutionalPolo = polo || { nome: workspace.poloNome };

  return (
    <article
      data-plano-curso-page={pageNumber}
      aria-label={`Página ${pageNumber} de ${totalPages} do Plano de Curso`}
      className="relative mx-auto min-h-[1123px] w-full max-w-5xl overflow-hidden rounded-sm border border-slate-200 bg-white shadow-2xl shadow-slate-950/10 sm:aspect-[210/297]"
    >
      <ReportWatermark polo={institutionalPolo} orientation="portrait" />
      <div className="absolute inset-0 z-10">
        <div className="h-2 bg-[#001a33]" />
        <div className="px-5 pb-16 pt-7 sm:px-9 sm:pt-9 lg:px-12">
          <DocumentHeader polo={institutionalPolo} orientation="portrait" />
          <div className="mb-6 border-b border-slate-200 pb-6 text-center">
            <h2 className="text-xl font-black uppercase tracking-[0.08em] text-[#001a33] sm:text-2xl">
              Plano de Curso
            </h2>
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">
              {workspace.cursoNome} · {workspace.turmaNome}
            </p>
          </div>
          {children}
        </div>
      </div>
      <footer className="pointer-events-none absolute inset-x-5 bottom-5 z-20 flex items-center justify-between border-t border-slate-200/80 pt-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 sm:inset-x-9 lg:inset-x-12">
        <span>Plano de Curso</span>
        <span>Página {pageNumber} de {totalPages}</span>
      </footer>
    </article>
  );
};

const PlanoCursoDayEditorRow = React.memo(({
  canEdit,
  content,
  day,
  dayNumber,
  isLegacyMerged,
  isMutating,
  onContentChange,
}: {
  canEdit: boolean;
  content: string;
  day: PlanoCursoDiaEditor;
  dayNumber: number;
  isLegacyMerged: boolean;
  isMutating: boolean;
  onContentChange: (dataAula: string, value: string) => void;
}) => (
  <div className="grid min-h-[205px] gap-4 px-4 py-5 lg:grid-cols-[240px_1fr] lg:px-5">
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-purple-700">
        Dia letivo {String(dayNumber).padStart(2, '0')}
      </p>
      <p className="mt-1 text-base font-black text-[#001a33]">{day.dataExibicao}</p>
      <div className="mt-3 space-y-1.5">
        {day.titulos.map((titulo) => (
          <p key={titulo} className="text-xs font-semibold leading-5 text-slate-600">{titulo}</p>
        ))}
      </div>
      {day.aulaIds.length > 1 ? (
        <p className="mt-3 inline-flex rounded-full bg-purple-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-purple-700">
          Aulas do dia reunidas
        </p>
      ) : null}
    </div>
    <div>
      {canEdit ? (
        <>
          <label htmlFor={`conteudo-${day.dataAula}`} className="mb-2 block text-[11px] font-black uppercase tracking-wide text-slate-500">
            Conteúdo programático do dia
          </label>
          <textarea
            id={`conteudo-${day.dataAula}`}
            value={content}
            onChange={(event) => onContentChange(day.dataAula, event.target.value)}
            disabled={isMutating}
            rows={4}
            maxLength={8_000}
            placeholder="Descreva o conteúdo programático deste dia"
            className="h-28 w-full resize-none rounded-lg border border-slate-300 bg-white/90 px-4 py-3 text-sm font-medium leading-6 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-purple-500 focus:bg-white focus:ring-4 focus:ring-purple-50 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
          <div className="mt-1.5 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <p className={`text-[10px] font-semibold leading-4 ${isLegacyMerged ? 'text-amber-700' : 'text-slate-400'}`}>
              {isLegacyMerged
                ? 'Textos anteriores foram reunidos para leitura. Ao editar, o novo texto será aplicado ao dia inteiro.'
                : 'Este texto vale para todas as aulas previstas nesta data.'}
            </p>
            <span className="shrink-0 text-[10px] font-bold text-slate-400">
              {content.length.toLocaleString('pt-BR')}/8.000
            </span>
          </div>
        </>
      ) : (
        <div>
          <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
            Conteúdo programático do dia
          </p>
          <div className="min-h-24 whitespace-pre-wrap rounded-lg bg-slate-50/90 px-4 py-3 text-sm font-medium leading-6 text-slate-700">
            {content || <span className="italic text-slate-400">Não informado.</span>}
          </div>
        </div>
      )}
    </div>
  </div>
));

PlanoCursoDayEditorRow.displayName = 'PlanoCursoDayEditorRow';

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

const PlanoCursoPage: React.FC<PlanoCursoPageProps> = ({ professorId, poloId, polo }) => {
  const { toasts, removeToast, toast } = useToast();
  const [selected, setSelected] = useState<SelectedAssignment | null>(null);
  const [objetivosText, setObjetivosText] = useState('');
  const [criteriosText, setCriteriosText] = useState('');
  const [insumosText, setInsumosText] = useState('');
  const [conteudosPorDia, setConteudosPorDia] = useState<Record<string, string>>({});
  const [diasConteudoEditados, setDiasConteudoEditados] = useState<Set<string>>(() => new Set());
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
  const diasEditor = useMemo(
    () => groupPlanoCursoAulasByDay(workspace?.aulas || []),
    [workspace?.aulas],
  );
  const diasPaginas = useMemo(
    () => paginatePlanoCursoDays(diasEditor),
    [diasEditor],
  );
  const totalEditorPages = 1 + diasPaginas.length;

  const markEditorDirty = useCallback(() => {
    editorSessionRef.current = dirtyPlanoCursoEditorSession(editorSessionRef.current);
    setIsEditorDirty(true);
  }, []);

  const handleDayContentChange = useCallback((dataAula: string, value: string) => {
    setConteudosPorDia((current) => ({ ...current, [dataAula]: value }));
    setDiasConteudoEditados((current) => {
      const next = new Set(current);
      next.add(dataAula);
      return next;
    });
    markEditorDirty();
  }, [markEditorDirty]);

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
    setConteudosPorDia(Object.fromEntries(
      groupPlanoCursoAulasByDay(current.aulas).map((dia) => [dia.dataAula, dia.conteudo]),
    ));
    setDiasConteudoEditados(new Set());
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
    conteudosAulas: expandPlanoCursoConteudosByDay(
      current.aulas,
      conteudosPorDia,
      diasConteudoEditados,
    ),
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

  const validateConteudosPorDia = () => {
    const oversizedDay = diasEditor.find((dia) => (
      diasConteudoEditados.has(dia.dataAula)
      && (conteudosPorDia[dia.dataAula]?.trim().length || 0) > 8_000
    ));
    if (!oversizedDay) return true;
    toast.error(
      'Conteúdo muito extenso',
      `O conteúdo de ${oversizedDay.dataExibicao} deve ter no máximo 8.000 caracteres.`,
    );
    return false;
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
    if (!validateConteudosPorDia()) return;
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
    if (!validateConteudosPorDia()) return;
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
            <div className="space-y-4">
              <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-950/5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#001a33] text-white">
                    <FilePenLine size={19} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlanoStatusBadge status={workspace.status} />
                      <span className="text-[10px] font-bold text-slate-400">
                        Revisão {editorBaseRevision ?? workspace.revisao}
                        {isEditorDirty ? ' · alterações não salvas' : ''}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-black text-[#001a33]">{workspace.disciplinaNome}</p>
                  </div>
                </div>
                {workspace.canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { void handleSave(); }} disabled={isMutating || hasRemoteConflict} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-purple-700 transition hover:bg-purple-100 disabled:opacity-50 sm:flex-none">
                      {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar rascunho
                    </button>
                    <button type="button" onClick={() => { void handleConclude(); }} disabled={isMutating || hasRemoteConflict} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 sm:flex-none">
                      {concludeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Concluir plano
                    </button>
                  </div>
                ) : null}
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

              <div className="space-y-6 rounded-[2rem] border border-slate-200 bg-slate-100 p-3 shadow-inner sm:p-6">
                <PlanoCursoPaper
                  pageNumber={1}
                  polo={polo}
                  totalPages={totalEditorPages}
                  workspace={workspace}
                >
                  <div className="overflow-hidden rounded-lg border border-slate-300 bg-white/75">
                    {[
                      ['Componente curricular', workspace.disciplinaNome],
                      ['Professor(a)', workspace.professorNome],
                      ['Dias das aulas', `${diasEditor.length} dias letivos`],
                    ].map(([label, value]) => (
                      <div key={label} className="grid gap-1 border-b border-slate-200 px-4 py-3 last:border-b-0 sm:grid-cols-[190px_1fr] sm:gap-4">
                        <p className="text-[11px] font-black uppercase tracking-wide text-[#001a33]">{label}</p>
                        <p className="text-sm font-semibold text-slate-700">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 overflow-hidden rounded-lg border border-slate-300 bg-white/75">
                    {[
                      { id: 'objetivos', label: 'Objetivos da disciplina', value: objetivosText, setter: setObjetivosText, help: 'Um objetivo por linha.' },
                      { id: 'criterios', label: 'Critérios de avaliação utilizados', value: criteriosText, setter: setCriteriosText, help: 'Um critério por linha.' },
                      { id: 'insumos', label: 'Insumos utilizados', value: insumosText, setter: setInsumosText, help: 'Um recurso por linha.' },
                    ].map((field) => (
                      <section key={field.id} className="border-b border-slate-200 last:border-b-0">
                        <div className="flex flex-col gap-1 bg-slate-50/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <h3 className="text-xs font-black uppercase tracking-wide text-[#001a33]">{field.label}</h3>
                          {workspace.canEdit ? <p id={`${field.id}-help`} className="text-[10px] font-semibold text-slate-400">{field.help}</p> : null}
                        </div>
                        {workspace.canEdit ? (
                          <textarea
                            id={field.id}
                            value={field.value}
                            onChange={(event) => { field.setter(event.target.value); markEditorDirty(); }}
                            disabled={isMutating}
                            rows={4}
                            aria-describedby={`${field.id}-help`}
                            className="block h-28 w-full resize-none border-0 bg-white/85 px-4 py-3 text-sm font-medium leading-6 text-slate-700 outline-none transition focus:bg-white focus:ring-2 focus:ring-inset focus:ring-purple-400 disabled:cursor-not-allowed disabled:bg-slate-50"
                          />
                        ) : (
                          <div className="min-h-24 px-4 py-3 text-sm font-medium leading-6 text-slate-700">
                            {linesToItems(field.value).length > 0 ? linesToItems(field.value).map((item) => <p key={item}>• {item}</p>) : <p className="italic text-slate-400">Não informado.</p>}
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                </PlanoCursoPaper>

                {diasPaginas.map((diasPagina, pageIndex) => {
                  const firstDayNumber = pageIndex * PLANO_CURSO_DAYS_PER_PAGE + 1;
                  const lastDayNumber = firstDayNumber + diasPagina.length - 1;
                  const pageNumber = pageIndex + 2;

                  return (
                    <PlanoCursoPaper
                      key={diasPagina[0]?.dataAula || pageNumber}
                      pageNumber={pageNumber}
                      polo={polo}
                      totalPages={totalEditorPages}
                      workspace={workspace}
                    >
                      <section className="overflow-hidden rounded-lg border border-slate-300 bg-white/75">
                        <div className="flex flex-col gap-3 border-b border-slate-200 bg-[#001a33] px-4 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="text-xs font-black uppercase tracking-wide">Datas de atividades / conteúdo programático</h3>
                            <p className="mt-1 text-[11px] font-medium text-slate-300">Uma entrada por dia letivo. Aulas do mesmo dia aparecem reunidas.</p>
                          </div>
                          <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider">
                            Dias {firstDayNumber}–{lastDayNumber} de {diasEditor.length}
                          </span>
                        </div>
                        <div className="divide-y divide-slate-200">
                          {diasPagina.map((day, dayIndex) => {
                            const content = conteudosPorDia[day.dataAula] || '';
                            const isLegacyMerged = day.possuiConteudosDivergentes
                              && !diasConteudoEditados.has(day.dataAula);

                            return (
                              <PlanoCursoDayEditorRow
                                key={day.dataAula}
                                canEdit={workspace.canEdit}
                                content={content}
                                day={day}
                                dayNumber={firstDayNumber + dayIndex}
                                isLegacyMerged={isLegacyMerged}
                                isMutating={isMutating}
                                onContentChange={handleDayContentChange}
                              />
                            );
                          })}
                        </div>
                      </section>
                    </PlanoCursoPaper>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default PlanoCursoPage;
