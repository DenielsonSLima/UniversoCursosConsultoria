import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  FilePlus2,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
  X,
} from 'lucide-react';
import type { ProfessorCoordenacao } from './coordenacoes.contract';
import { coordenacoesQueryKeys, createCoordenacoesScope } from './coordenacoes.query-keys';
import { coordenacoesService } from './coordenacoes.service';

type ToastApi = {
  success: (title: string, message: string) => void;
  error: (title: string, message: string) => void;
  info: (title: string, message: string) => void;
};

interface CoordenacoesTabProps {
  poloId?: string | null;
  includeGlobal?: boolean;
  toast: ToastApi;
}

const fieldClassName = 'mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';

const createRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  throw new Error('Este navegador não consegue identificar com segurança esta operação.');
};

const toIsoOrNull = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Informe uma data e hora válidas.');
  return date.toISOString();
};

const formatDateTime = (value: string | null) => {
  if (!value) return 'Não definida';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data devolvida pelo serviço';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const statusClassName = (status: string) => {
  if (status === 'ATIVA') return 'bg-emerald-50 text-emerald-700';
  if (status === 'REVOGADA') return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-600';
};

const MISSING_SCOPE = { poloId: 'escopo-ausente', includeGlobal: false } as const;

const CoordenacoesTab: React.FC<CoordenacoesTabProps> = ({ poloId: scopePoloId, includeGlobal, toast }) => {
  const queryClient = useQueryClient();
  const queryScope = useMemo(
    () => createCoordenacoesScope(scopePoloId, includeGlobal),
    [includeGlobal, scopePoloId],
  );
  const queryKeyScope = queryScope || MISSING_SCOPE;
  const scopeIdentity = queryScope
    ? `${queryScope.poloId}:${queryScope.includeGlobal ? 'global' : 'local'}`
    : 'escopo-ausente';
  const activeScopeIdentityRef = useRef(scopeIdentity);
  activeScopeIdentityRef.current = scopeIdentity;
  const createRequestIdsRef = useRef(new Map<string, string>());
  const revokeRequestIdsRef = useRef(new Map<string, string>());
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('todos');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [professorId, setProfessorId] = useState('');
  const [cursoId, setCursoId] = useState('');
  const [poloId, setPoloId] = useState('');
  const [vigenteDe, setVigenteDe] = useState('');
  const [vigenteAte, setVigenteAte] = useState('');
  const [observacao, setObservacao] = useState('');
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revocationReason, setRevocationReason] = useState('');

  useEffect(() => {
    setShowCreateForm(false);
    setProfessorId('');
    setCursoId('');
    setPoloId('');
    setVigenteDe('');
    setVigenteAte('');
    setObservacao('');
    setRevokingId(null);
    setRevocationReason('');
  }, [scopeIdentity]);

  const listQuery = useInfiniteQuery({
    queryKey: coordenacoesQueryKeys.list(queryKeyScope, busca, status),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      if (!queryScope) throw new Error('Selecione um polo válido para carregar coordenações.');
      return coordenacoesService.listar({
        scope: queryScope,
        busca,
        status,
        limite: 50,
        cursor: pageParam as string | null,
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    staleTime: 30_000,
    retry: false,
    enabled: Boolean(queryScope),
  });
  const optionsQuery = useQuery({
    queryKey: coordenacoesQueryKeys.opcoes(queryKeyScope),
    queryFn: () => {
      if (!queryScope) throw new Error('O escopo para listar opções não está disponível.');
      return coordenacoesService.listarOpcoesCadastro(queryScope);
    },
    staleTime: 5 * 60_000,
    retry: false,
    enabled: Boolean(queryScope),
  });

  const invalidatePolo = async (affectedPoloId: string) => {
    await queryClient.invalidateQueries({ queryKey: coordenacoesQueryKeys.polo(affectedPoloId) });
  };

  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof coordenacoesService.salvar>[0]) => coordenacoesService.salvar(input),
    retry: false,
    onSuccess: async (result, input) => {
      await invalidatePolo(result.poloId);
      for (const [fingerprint, requestId] of createRequestIdsRef.current) {
        if (requestId === input.requestId) createRequestIdsRef.current.delete(fingerprint);
      }
      const mutationScopeIdentity = `${input.scope.poloId}:${input.scope.includeGlobal ? 'global' : 'local'}`;
      if (activeScopeIdentityRef.current === mutationScopeIdentity) {
        setProfessorId('');
        setCursoId('');
        setPoloId('');
        setVigenteDe('');
        setVigenteAte('');
        setObservacao('');
        setShowCreateForm(false);
      }
      toast.success('Coordenação registrada', `A atribuição foi devolvida pelo serviço como ${result.status}.`);
    },
    onError: (error) => toast.error(
      'Não foi possível registrar a coordenação',
      error instanceof Error ? error.message : 'Tente novamente.',
    ),
  });

  const revokeMutation = useMutation({
    mutationFn: (input: Parameters<typeof coordenacoesService.revogar>[0]) => coordenacoesService.revogar(input),
    retry: false,
    onSuccess: async (result, input) => {
      revokeRequestIdsRef.current.delete(
        `${input.scope.poloId}:${input.scope.includeGlobal}:${input.professorCoordenacaoId}:${input.motivo.trim()}`,
      );
      await invalidatePolo(result.poloId);
      const mutationScopeIdentity = `${input.scope.poloId}:${input.scope.includeGlobal ? 'global' : 'local'}`;
      if (activeScopeIdentityRef.current === mutationScopeIdentity) {
        setRevokingId(null);
        setRevocationReason('');
      }
      toast.success('Coordenação revogada', `O serviço registrou a situação ${result.status}.`);
    },
    onError: (error) => toast.error(
      'Não foi possível revogar a coordenação',
      error instanceof Error ? error.message : 'Tente novamente.',
    ),
  });

  const professoresAutorizados = useMemo(
    () => [...(optionsQuery.data?.professores || [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [optionsQuery.data?.professores],
  );
  const polosAutorizados = useMemo(() => {
    const professor = professoresAutorizados.find((item) => item.id === professorId);
    if (!professor) return [];
    return (optionsQuery.data?.polos || []).filter((polo) => professor.poloIds.includes(polo.id));
  }, [optionsQuery.data?.polos, professorId, professoresAutorizados]);
  const coordenacoes = useMemo(() => {
    const uniqueItems = new Map<string, ProfessorCoordenacao>();
    for (const page of listQuery.data?.pages || []) {
      for (const item of page.items) uniqueItems.set(item.id, item);
    }
    return [...uniqueItems.values()];
  }, [listQuery.data?.pages]);

  const resetCreateForm = () => {
    setShowCreateForm(false);
    setProfessorId('');
    setCursoId('');
    setPoloId('');
    setVigenteDe('');
    setVigenteAte('');
    setObservacao('');
  };

  const submitCreate: React.FormEventHandler = (event) => {
    event.preventDefault();
    if (!queryScope) {
      toast.error('Selecione um polo', 'O serviço exige um polo explícito para registrar a coordenação.');
      return;
    }
    if (!professorId || !cursoId || !poloId) {
      toast.error('Informe o escopo', 'Selecione professor, curso e polo para registrar a coordenação.');
      return;
    }
    try {
      const inicio = toIsoOrNull(vigenteDe);
      const fim = toIsoOrNull(vigenteAte);
      if (inicio && fim && new Date(fim).getTime() <= new Date(inicio).getTime()) {
        toast.error('Período inválido', 'A vigência final precisa ser posterior ao início.');
        return;
      }
      const fingerprint = JSON.stringify({
        scope: queryScope,
        professorId,
        cursoId,
        poloId,
        inicio,
        fim,
        observacao: observacao.trim(),
      });
      const requestId = createRequestIdsRef.current.get(fingerprint) || createRequestId();
      createRequestIdsRef.current.set(fingerprint, requestId);
      createMutation.mutate({
        scope: queryScope,
        dados: {
          professorId,
          cursoId,
          poloId,
          ...(inicio ? { vigenteDe: inicio } : {}),
          ...(fim ? { vigenteAte: fim } : {}),
          ...(observacao.trim() ? { observacao } : {}),
        },
        requestId,
      });
    } catch (error) {
      toast.error('Não foi possível preparar a coordenação', error instanceof Error ? error.message : 'Tente novamente.');
    }
  };

  const submitRevoke = (coordenacao: ProfessorCoordenacao) => {
    if (!queryScope) {
      toast.error('Selecione um polo', 'O serviço exige um polo explícito para revogar a coordenação.');
      return;
    }
    const motivo = revocationReason.trim();
    if (motivo.length < 5 || motivo.length > 500) {
      toast.error('Informe o motivo', 'A revogação exige um motivo entre 5 e 500 caracteres.');
      return;
    }
    try {
      const key = `${queryScope.poloId}:${queryScope.includeGlobal}:${coordenacao.id}:${motivo}`;
      const requestId = revokeRequestIdsRef.current.get(key) || createRequestId();
      revokeRequestIdsRef.current.set(key, requestId);
      revokeMutation.mutate({
        scope: queryScope,
        professorCoordenacaoId: coordenacao.id,
        motivo,
        requestId,
      });
    } catch (error) {
      toast.error('Não foi possível preparar a revogação', error instanceof Error ? error.message : 'Tente novamente.');
    }
  };

  if (!queryScope) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <div className="flex items-start gap-3 text-amber-900">
          <ShieldAlert className="mt-0.5 shrink-0" size={20} />
          <div>
            <h2 className="text-sm font-black">Selecione um polo para consultar coordenações</h2>
            <p className="mt-1 text-xs font-medium leading-relaxed text-amber-800">
              Nenhuma consulta ou alteração é enviada sem um polo explícito para o serviço autorizado.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-blue-700"><BookOpenCheck size={20} /><p className="text-[10px] font-black uppercase tracking-[0.18em]">Parceiros</p></div>
          <h2 className="mt-1 text-2xl font-black text-[#001a33]">Coordenações de curso</h2>
          <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-slate-500">Consulte, registre ou revogue atribuições. As RPCs validam identidade, vigência e escopo do gestor em cada ação.</p>
        </div>
        <button type="button" onClick={() => setShowCreateForm(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 text-xs font-black text-white shadow-lg shadow-blue-900/15 transition hover:bg-blue-700"><FilePlus2 size={16} /> Nova coordenação</button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row">
        <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar professor, curso ou polo" className="h-10 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"><option value="todos">Todos os status</option><option value="ATIVA">Ativas</option><option value="REVOGADA">Revogadas</option><option value="EXPIRADA">Expiradas</option></select>
        <button type="button" onClick={() => void listQuery.refetch()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-[10px] font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50"><RefreshCw size={14} /> Atualizar</button>
      </div>

      {showCreateForm ? (
        <form onSubmit={submitCreate} className="rounded-3xl border border-blue-100 bg-blue-50/40 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-black text-[#001a33]">Nova atribuição de coordenação</h3><p className="mt-1 text-xs font-medium text-slate-500">A tela só coleta a intenção. A RPC verifica se professor, curso e polo pertencem ao escopo autorizado.</p></div><button type="button" onClick={resetCreateForm} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Fechar formulário"><X size={17} /></button></div>
          {optionsQuery.isError ? <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs font-bold text-rose-700">Não foi possível carregar cursos e polos disponíveis. <button type="button" onClick={() => void optionsQuery.refetch()} className="underline">Tentar novamente</button></div> : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">Professor *<select required value={professorId} onChange={(event) => { setProfessorId(event.target.value); setPoloId(''); }} className={fieldClassName} disabled={optionsQuery.isPending || optionsQuery.isError}><option value="">{optionsQuery.isPending ? 'Carregando professores…' : 'Selecione o professor'}</option>{professoresAutorizados.map((professor) => <option key={professor.id} value={professor.id}>{professor.nome}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-600">Curso *<select required value={cursoId} onChange={(event) => setCursoId(event.target.value)} className={fieldClassName} disabled={optionsQuery.isPending || optionsQuery.isError}><option value="">{optionsQuery.isPending ? 'Carregando cursos…' : 'Selecione o curso'}</option>{(optionsQuery.data?.cursos || []).map((curso) => <option key={curso.id} value={curso.id}>{curso.nome}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-600">Polo *<select required value={poloId} onChange={(event) => setPoloId(event.target.value)} className={fieldClassName} disabled={optionsQuery.isPending || optionsQuery.isError || !professorId}><option value="">{optionsQuery.isPending ? 'Carregando polos…' : !professorId ? 'Selecione o professor primeiro' : 'Selecione o polo'}</option>{polosAutorizados.map((polo) => <option key={polo.id} value={polo.id}>{polo.nome}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-600">Início da vigência<input type="datetime-local" value={vigenteDe} onChange={(event) => setVigenteDe(event.target.value)} className={fieldClassName} /></label>
            <label className="text-xs font-bold text-slate-600">Fim da vigência<input type="datetime-local" value={vigenteAte} onChange={(event) => setVigenteAte(event.target.value)} className={fieldClassName} /></label>
            <label className="text-xs font-bold text-slate-600 md:col-span-2">Observação<textarea value={observacao} onChange={(event) => setObservacao(event.target.value)} minLength={2} maxLength={500} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" placeholder="Opcional; 2 a 500 caracteres quando informada" /></label>
          </div>
          {!optionsQuery.isPending && !optionsQuery.isError && (professoresAutorizados.length === 0 || (optionsQuery.data?.cursos.length || 0) === 0 || (optionsQuery.data?.polos.length || 0) === 0) ? <p className="mt-3 text-xs font-bold text-amber-700">O serviço não devolveu todas as opções autorizadas para este cadastro.</p> : null}
          <div className="mt-4 flex justify-end"><button type="submit" disabled={createMutation.isPending || optionsQuery.isPending || optionsQuery.isError} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60">{createMutation.isPending ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />} Registrar coordenação</button></div>
        </form>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><p className="text-sm font-black text-[#001a33]">Atribuições devolvidas pelo serviço</p></div>
        {listQuery.isPending ? <div className="flex min-h-52 items-center justify-center gap-3 text-sm font-bold text-slate-500"><Loader2 size={20} className="animate-spin text-blue-600" /> Carregando coordenações…</div> : listQuery.isError ? <div className="p-5"><p className="text-sm font-black text-rose-700">Não foi possível carregar as coordenações.</p><button type="button" onClick={() => void listQuery.refetch()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700"><RefreshCw size={14} /> Tentar novamente</button></div> : coordenacoes.length === 0 ? <div className="p-8 text-center"><UserRound className="mx-auto text-slate-400" size={25} /><p className="mt-3 text-sm font-black text-[#001a33]">Nenhuma coordenação encontrada</p><p className="mt-1 text-xs font-medium text-slate-500">Registre uma atribuição para disponibilizar o contexto próprio de coordenador.</p></div> : <><ul className="divide-y divide-slate-100">{coordenacoes.map((coordenacao) => <li key={coordenacao.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-base font-black text-[#001a33]">{coordenacao.cursoNome}</p><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${statusClassName(coordenacao.status)}`}>{coordenacao.status}</span></div><p className="mt-1 text-sm font-bold text-slate-700">{coordenacao.professorNome}</p><dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Polo</dt><dd className="mt-1 font-bold text-slate-700">{coordenacao.poloNome}</dd></div><div className="rounded-xl bg-slate-50 p-3"><dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Início</dt><dd className="mt-1 font-bold text-slate-700">{formatDateTime(coordenacao.vigenteDe)}</dd></div><div className="rounded-xl bg-slate-50 p-3"><dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Fim</dt><dd className="mt-1 font-bold text-slate-700">{formatDateTime(coordenacao.vigenteAte)}</dd></div></dl>{coordenacao.observacao ? <p className="mt-3 max-w-3xl text-xs font-medium leading-relaxed text-slate-500">{coordenacao.observacao}</p> : null}</div>{coordenacao.status === 'ATIVA' ? <div className="min-w-[15rem] rounded-2xl border border-rose-100 bg-rose-50/40 p-3"><p className="text-xs font-black text-rose-800">Revogar atribuição</p>{revokingId === coordenacao.id ? <><textarea value={revocationReason} onChange={(event) => setRevocationReason(event.target.value)} minLength={5} maxLength={500} rows={3} className="mt-2 w-full rounded-xl border border-rose-100 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100" placeholder="Motivo (5 a 500 caracteres)" /><div className="mt-2 flex gap-2"><button type="button" onClick={() => submitRevoke(coordenacao)} disabled={revokeMutation.isPending || revocationReason.trim().length < 5} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-3 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-60">{revokeMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : <ShieldAlert size={14} />} Confirmar</button><button type="button" onClick={() => { setRevokingId(null); setRevocationReason(''); }} className="h-9 rounded-xl border border-rose-100 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-rose-700">Cancelar</button></div></> : <button type="button" onClick={() => { setRevokingId(coordenacao.id); setRevocationReason(''); }} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-rose-700 hover:bg-rose-100"><ShieldAlert size={14} /> Revogar</button>}</div> : null}</div></li>)}</ul>{listQuery.hasNextPage ? <div className="border-t border-slate-100 p-4"><button type="button" disabled={listQuery.isFetchingNextPage} onClick={() => void listQuery.fetchNextPage()} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">{listQuery.isFetchingNextPage ? <Loader2 className="animate-spin" size={15} /> : <ChevronDown size={15} />}{listQuery.isFetchingNextPage ? 'Carregando mais…' : 'Carregar mais'}</button></div> : <p className="border-t border-slate-100 p-4 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">Fim da lista devolvida pelo serviço</p>}</>}
      </div>
    </section>
  );
};

export default CoordenacoesTab;
