import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  FilePlus2,
  KeyRound,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import type {
  ResponsavelIdentidadeVerificacaoMetodo,
  ResponsavelLegal,
  ResponsavelLegalDetalhe,
  ResponsaveisLegaisScope,
  ResponsavelVinculoVerificacaoMetodo,
} from './responsaveis.contract';
import {
  createResponsaveisLegaisScope,
  responsaveisLegaisQueryKeys,
} from './responsaveis.query-keys';
import { responsaveisLegaisService } from './responsaveis.service';

type ToastApi = {
  success: (title: string, message: string) => void;
  error: (title: string, message: string) => void;
  info: (title: string, message: string) => void;
};

type Parentesco = 'MAE' | 'PAI' | 'TUTOR' | 'GUARDIAO_JUDICIAL' | 'OUTRO';
type VinculoStatus = 'PENDENTE' | 'VERIFICADO';

interface ResponsaveisTabProps {
  poloId?: string | null;
  includeGlobal?: boolean;
  toast: ToastApi;
}

const eligibilityMessage = (reason: string | null) => {
  const messages: Record<string, string> = {
    STATUS_NAO_ATIVO: 'O responsável precisa estar ativo.',
    CPF_OBRIGATORIO: 'Informe o CPF para preparar o acesso.',
    EMAIL_OBRIGATORIO: 'Informe o e-mail para preparar o acesso.',
    IDENTIDADE_NAO_VERIFICADA: 'A identidade ainda precisa de verificação registrada.',
    VINCULO_VERIFICADO_VIGENTE_OBRIGATORIO: 'É necessário um vínculo verificado e vigente com aluno ativo.',
  };
  return reason
    ? messages[reason] || 'O serviço ainda não liberou este acesso.'
    : 'O serviço ainda não liberou este acesso.';
};

const fieldClassName = 'mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';

const createStableRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  throw new Error('Este navegador não consegue identificar com segurança esta tentativa de preparo de acesso.');
};

const isVerificationReferenceValid = (value: string) => {
  const length = value.trim().length;
  return length >= 3 && length <= 120;
};

const MISSING_SCOPE = { poloId: 'escopo-ausente', includeGlobal: false } as const;

const getStableRequestId = (registry: Map<string, string>, fingerprint: string) => {
  const current = registry.get(fingerprint);
  if (current) return current;
  const created = createStableRequestId();
  registry.set(fingerprint, created);
  return created;
};

const ResponsaveisTab: React.FC<ResponsaveisTabProps> = ({ poloId, includeGlobal, toast }) => {
  const queryClient = useQueryClient();
  const accessRequestIdsRef = useRef(new Map<string, string>());
  const mutationRequestIdsRef = useRef(new Map<string, string>());
  const queryScope = useMemo(
    () => createResponsaveisLegaisScope(poloId, includeGlobal),
    [includeGlobal, poloId],
  );
  const queryKeyScope = queryScope || MISSING_SCOPE;
  const scopeIdentity = queryScope
    ? `${queryScope.poloId}:${queryScope.includeGlobal ? 'global' : 'local'}`
    : 'escopo-ausente';
  const activeScopeIdentityRef = useRef(scopeIdentity);
  activeScopeIdentityRef.current = scopeIdentity;
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('todos');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [showIdentityVerificationForm, setShowIdentityVerificationForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [editNome, setEditNome] = useState('');
  const [editCpf, setEditCpf] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTelefone, setEditTelefone] = useState('');
  const [identityVerificationMethod, setIdentityVerificationMethod] = useState<ResponsavelIdentidadeVerificacaoMetodo | ''>('');
  const [identityVerificationReference, setIdentityVerificationReference] = useState('');
  const [alunoId, setAlunoId] = useState('');
  const [parentesco, setParentesco] = useState<Parentesco | ''>('');
  const [descricaoOutro, setDescricaoOutro] = useState('');
  const [linkStatus, setLinkStatus] = useState<VinculoStatus>('PENDENTE');
  const [linkVerificationMethod, setLinkVerificationMethod] = useState<ResponsavelVinculoVerificacaoMetodo | ''>('');
  const [linkVerificationReference, setLinkVerificationReference] = useState('');

  useEffect(() => {
    setSelectedId(null);
    setShowCreateForm(false);
    setShowLinkForm(false);
    setShowIdentityVerificationForm(false);
    setIsEditing(false);
    setAlunoId('');
    setParentesco('');
    setDescricaoOutro('');
    setLinkStatus('PENDENTE');
    setLinkVerificationMethod('');
    setLinkVerificationReference('');
  }, [scopeIdentity]);

  const listQuery = useInfiniteQuery({
    queryKey: responsaveisLegaisQueryKeys.list(queryKeyScope, busca, status),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      if (!queryScope) throw new Error('Selecione um polo válido para carregar responsáveis.');
      return responsaveisLegaisService.listar({
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
  const detailQuery = useQuery({
    queryKey: responsaveisLegaisQueryKeys.detail(queryKeyScope, selectedId || 'sem-selecao'),
    queryFn: () => {
      if (!queryScope || !selectedId) throw new Error('O escopo do responsável não está disponível.');
      return responsaveisLegaisService.obter(selectedId, queryScope);
    },
    enabled: Boolean(queryScope && selectedId),
    retry: false,
  });
  const alunosQuery = useQuery({
    queryKey: responsaveisLegaisQueryKeys.alunosParaVinculo(queryKeyScope),
    queryFn: () => {
      if (!queryScope) throw new Error('O escopo para listar alunos não está disponível.');
      return responsaveisLegaisService.listarAlunosParaVinculo(queryScope);
    },
    enabled: Boolean(queryScope && selectedId && showLinkForm),
    staleTime: 60_000,
    retry: false,
  });

  const invalidateAffectedPolos = async (poloIds: readonly string[]) => {
    await Promise.all([...new Set(poloIds)].map((affectedPoloId) => (
      queryClient.invalidateQueries({ queryKey: responsaveisLegaisQueryKeys.polo(affectedPoloId) })
    )));
  };

  const saveMutation = useMutation({
    mutationFn: (input: {
      fingerprint: string;
      requestId: string;
      scope: ResponsaveisLegaisScope;
      dados: { nome: string; cpf: string | null; email: string | null; telefone: string | null };
    }) => responsaveisLegaisService.salvar({
      scope: input.scope,
      dados: input.dados,
      requestId: input.requestId,
    }),
    onSuccess: async (result, input) => {
      mutationRequestIdsRef.current.delete(input.fingerprint);
      await invalidateAffectedPolos(result.affectedPoloIds);
      const mutationScopeIdentity = `${input.scope.poloId}:${input.scope.includeGlobal ? 'global' : 'local'}`;
      if (activeScopeIdentityRef.current === mutationScopeIdentity) {
        setSelectedId(result.responsavelLegalId);
      }
      setShowCreateForm(false);
      setNome('');
      setCpf('');
      setEmail('');
      setTelefone('');
      toast.success(
        'Responsável salvo',
        'O cadastro foi enviado como pendente. O serviço é a única autoridade para liberar acesso.',
      );
    },
    onError: (error) => toast.error(
      'Não foi possível salvar',
      error instanceof Error ? error.message : 'Tente novamente.',
    ),
  });

  const updateMutation = useMutation({
    mutationFn: (input: {
      fingerprint: string;
      requestId: string;
      scope: ResponsaveisLegaisScope;
      responsavelLegalId: string;
      dados: { nome: string; cpf: string | null; email: string | null; telefone: string | null };
    }) => responsaveisLegaisService.salvar({
      scope: input.scope,
      responsavelLegalId: input.responsavelLegalId,
      dados: input.dados,
      requestId: input.requestId,
    }),
    onSuccess: async (result, input) => {
      mutationRequestIdsRef.current.delete(input.fingerprint);
      await invalidateAffectedPolos(result.affectedPoloIds);
      setIsEditing(false);
      toast.success('Dados atualizados', 'O serviço atualizou o cadastro do responsável.');
    },
    onError: (error) => toast.error(
      'Não foi possível atualizar',
      error instanceof Error ? error.message : 'Tente novamente.',
    ),
  });

  const verifyAndActivateMutation = useMutation({
    mutationFn: (input: {
      fingerprint: string;
      requestId: string;
      scope: ResponsaveisLegaisScope;
      responsavel: Pick<ResponsavelLegalDetalhe, 'id' | 'nome' | 'cpf' | 'email' | 'telefone'>;
      verificacaoMetodo: ResponsavelIdentidadeVerificacaoMetodo;
      verificacaoReferencia: string;
    }) => responsaveisLegaisService.salvar({
      scope: input.scope,
      responsavelLegalId: input.responsavel.id,
      dados: {
        nome: input.responsavel.nome,
        cpf: input.responsavel.cpf,
        email: input.responsavel.email,
        telefone: input.responsavel.telefone,
        status: 'ATIVO',
        verificacaoMetodo: input.verificacaoMetodo,
        verificacaoReferencia: input.verificacaoReferencia,
      },
      requestId: input.requestId,
    }),
    onSuccess: async (result, input) => {
      mutationRequestIdsRef.current.delete(input.fingerprint);
      await invalidateAffectedPolos(result.affectedPoloIds);
      setShowIdentityVerificationForm(false);
      setIdentityVerificationMethod('');
      setIdentityVerificationReference('');
      toast.success('Verificação registrada', 'A solicitação de ativação foi enviada ao serviço com o método e a referência informados.');
    },
    onError: (error) => toast.error(
      'Não foi possível registrar a verificação',
      error instanceof Error ? error.message : 'Confira os dados e tente novamente.',
    ),
  });

  const linkMutation = useMutation({
    mutationFn: (input: {
      fingerprint: string;
      requestId: string;
      scope: ResponsaveisLegaisScope;
      responsavelLegalId: string;
      alunoId: string;
      dados: {
        parentesco: Parentesco;
        descricaoOutro?: string;
        status: VinculoStatus;
        verificacaoMetodo?: ResponsavelVinculoVerificacaoMetodo;
        verificacaoReferencia?: string;
      };
    }) => responsaveisLegaisService.vincularAluno({
      scope: input.scope,
      responsavelLegalId: input.responsavelLegalId,
      alunoId: input.alunoId,
      dados: input.dados,
      requestId: input.requestId,
    }),
    onSuccess: async (result, input) => {
      mutationRequestIdsRef.current.delete(input.fingerprint);
      await invalidateAffectedPolos(result.affectedPoloIds);
      setAlunoId('');
      setParentesco('');
      setDescricaoOutro('');
      setLinkStatus('PENDENTE');
      setLinkVerificationMethod('');
      setLinkVerificationReference('');
      setShowLinkForm(false);
      toast.success(
        result.status === 'VERIFICADO' ? 'Vínculo verificado' : 'Vínculo pendente registrado',
        'A situação e a elegibilidade continuam sendo decididas pelo serviço.',
      );
    },
    onError: (error) => toast.error(
      'Não foi possível vincular',
      error instanceof Error ? error.message : 'Tente novamente.',
    ),
  });

  const accessMutation = useMutation({
    mutationFn: (input: {
      responsavel: Pick<ResponsavelLegal, 'id' | 'eligible' | 'accessBlockReason'>;
      requestId: string;
    }) => responsaveisLegaisService.prepararAcesso(input.responsavel, input.requestId),
    onSuccess: async (result, input) => {
      accessRequestIdsRef.current.delete(input.responsavel.id);
      await queryClient.invalidateQueries({ queryKey: responsaveisLegaisQueryKeys.root });
      toast.success('Acesso preparado', result.message || 'O serviço autorizou a preparação do acesso deste responsável.');
    },
    onError: (error) => toast.error(
      'Acesso não preparado',
      error instanceof Error ? error.message : 'Tente novamente.',
    ),
  });

  const items = useMemo(() => {
    const uniqueItems = new Map<string, ResponsavelLegal>();
    for (const page of listQuery.data?.pages || []) {
      for (const item of page.items) uniqueItems.set(item.id, item);
    }
    return [...uniqueItems.values()];
  }, [listQuery.data?.pages]);
  const listAccess = listQuery.data?.pages[0] || null;
  const selected = detailQuery.data || null;
  const alunosOrdenados = alunosQuery.data || [];
  const hasVerificationFields = Boolean(selected?.cpf?.trim() && selected?.email?.trim());
  // A capacidade vem pronta da RPC; o frontend apenas a representa e a mutação
  // continua sendo revalidada pelo serviço no escopo explícito selecionado.
  const canRegisterVerification = selected?.canVerify === true;
  const linkVerificationReady = linkStatus === 'VERIFICADO'
    && Boolean(linkVerificationMethod)
    && isVerificationReferenceValid(linkVerificationReference);

  const submitCreate: React.FormEventHandler = (event) => {
    event.preventDefault();
    if (!queryScope) {
      toast.error('Selecione um polo', 'O serviço exige um polo explícito para salvar o responsável.');
      return;
    }
    if (!nome.trim()) {
      toast.error('Informe o nome', 'O nome é o único campo obrigatório para iniciar o cadastro.');
      return;
    }
    const dados = {
      nome,
      cpf: cpf || null,
      email: email || null,
      telefone: telefone || null,
    };
    const fingerprint = `salvar:${JSON.stringify({ scope: queryScope, dados })}`;
    saveMutation.mutate({
      fingerprint,
      requestId: getStableRequestId(mutationRequestIdsRef.current, fingerprint),
      scope: queryScope,
      dados,
    });
  };

  const beginEditing = (responsavel: ResponsavelLegalDetalhe) => {
    setEditNome(responsavel.nome);
    setEditCpf(responsavel.cpf || '');
    setEditEmail(responsavel.email || '');
    setEditTelefone(responsavel.telefone || '');
    setIsEditing(true);
  };

  const submitEdit: React.FormEventHandler = (event) => {
    event.preventDefault();
    if (!selected || !queryScope) return;
    if (!editNome.trim()) {
      toast.error('Informe o nome', 'O nome do responsável não pode ficar vazio.');
      return;
    }
    const dados = {
      nome: editNome,
      cpf: editCpf || null,
      email: editEmail || null,
      telefone: editTelefone || null,
    };
    const fingerprint = `editar:${selected.id}:${JSON.stringify({ scope: queryScope, dados })}`;
    updateMutation.mutate({
      fingerprint,
      requestId: getStableRequestId(mutationRequestIdsRef.current, fingerprint),
      scope: queryScope,
      responsavelLegalId: selected.id,
      dados,
    });
  };

  const submitIdentityVerification: React.FormEventHandler = (event) => {
    event.preventDefault();
    if (!selected || !queryScope || !canRegisterVerification) return;
    if (!hasVerificationFields) {
      toast.info('CPF e e-mail necessários', 'Preencha ambos os dados antes de registrar a verificação.');
      return;
    }
    if (!identityVerificationMethod || !isVerificationReferenceValid(identityVerificationReference)) {
      toast.error('Informe a evidência', 'Selecione o método e informe referência ou protocolo entre 3 e 120 caracteres.');
      return;
    }
    const verificationPayload = {
      id: selected.id,
      nome: selected.nome,
      cpf: selected.cpf,
      email: selected.email,
      telefone: selected.telefone,
      verificacaoMetodo: identityVerificationMethod,
      verificacaoReferencia: identityVerificationReference.trim(),
    };
    const fingerprint = `verificar:${JSON.stringify({ scope: queryScope, verificationPayload })}`;
    verifyAndActivateMutation.mutate({
      fingerprint,
      requestId: getStableRequestId(mutationRequestIdsRef.current, fingerprint),
      scope: queryScope,
      responsavel: selected,
      verificacaoMetodo: identityVerificationMethod,
      verificacaoReferencia: identityVerificationReference,
    });
  };

  const submitLink: React.FormEventHandler = (event) => {
    event.preventDefault();
    if (!queryScope) {
      toast.error('Selecione um polo', 'O serviço exige um polo explícito para vincular o aluno.');
      return;
    }
    if (!selectedId || !alunoId) {
      toast.error('Selecione um aluno', 'Escolha o aluno que será vinculado a este responsável.');
      return;
    }
    if (!parentesco) {
      toast.error('Informe o parentesco', 'Selecione o tipo de vínculo antes de enviar.');
      return;
    }
    if (parentesco === 'OUTRO') {
      const descricao = descricaoOutro.trim();
      if (descricao.length < 2 || descricao.length > 120) {
        toast.error('Descreva o parentesco', 'Para OUTRO, informe uma descrição entre 2 e 120 caracteres.');
        return;
      }
    }
    if (linkStatus === 'VERIFICADO') {
      if (!canRegisterVerification) {
        toast.error('Verificação não autorizada', 'O serviço não liberou esta ação para o escopo atual.');
        return;
      }
      if (!linkVerificationReady) {
        toast.error('Informe a evidência', 'Selecione o método e informe referência ou protocolo entre 3 e 120 caracteres.');
        return;
      }
    }
    const dados = {
      parentesco: parentesco as Parentesco,
      ...(parentesco === 'OUTRO' ? { descricaoOutro } : {}),
      status: linkStatus,
      ...(linkStatus === 'VERIFICADO' ? {
        verificacaoMetodo: linkVerificationMethod as ResponsavelVinculoVerificacaoMetodo,
        verificacaoReferencia: linkVerificationReference,
      } : {}),
    };
    const fingerprint = `vincular:${selectedId}:${alunoId}:${JSON.stringify({ scope: queryScope, dados })}`;
    linkMutation.mutate({
      fingerprint,
      requestId: getStableRequestId(mutationRequestIdsRef.current, fingerprint),
      scope: queryScope,
      responsavelLegalId: selectedId,
      alunoId,
      dados,
    });
  };

  const selectResponsavel = (responsavelId: string) => {
    setSelectedId(responsavelId);
    setShowLinkForm(false);
    setShowIdentityVerificationForm(false);
    setIsEditing(false);
    setLinkStatus('PENDENTE');
    setLinkVerificationMethod('');
    setLinkVerificationReference('');
  };

  const closeDetails = () => {
    setSelectedId(null);
    setShowLinkForm(false);
    setShowIdentityVerificationForm(false);
    setIsEditing(false);
  };

  const prepareAccess = (responsavel: Pick<ResponsavelLegal, 'id' | 'eligible' | 'accessBlockReason'>) => {
    try {
      const requestId = accessRequestIdsRef.current.get(responsavel.id) || createStableRequestId();
      accessRequestIdsRef.current.set(responsavel.id, requestId);
      accessMutation.mutate({ responsavel, requestId });
    } catch (error) {
      toast.error('Acesso não preparado', error instanceof Error ? error.message : 'Tente novamente.');
    }
  };

  if (!queryScope) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <div className="flex items-start gap-3 text-amber-900">
          <ShieldAlert className="mt-0.5 shrink-0" size={20} />
          <div>
            <h2 className="text-sm font-black">Selecione um polo para consultar responsáveis</h2>
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
          <div className="flex items-center gap-2 text-blue-700">
            <UsersRound size={20} />
            <p className="text-[10px] font-black uppercase tracking-[0.18em]">Parceiros</p>
          </div>
          <h2 className="mt-1 text-2xl font-black text-[#001a33]">Responsáveis legais</h2>
          <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-slate-500">
            Cadastre, vincule e acompanhe a situação do responsável. Elegibilidade, permissões e acesso sempre vêm do serviço autorizado.
          </p>
          {listAccess ? (
            <p className={`mt-2 text-[10px] font-black uppercase tracking-wide ${listAccess.canManageGlobal ? 'text-emerald-700' : 'text-slate-500'}`}>
              {listAccess.canManageGlobal
                ? 'Escopo global confirmado pelo serviço'
                : 'Escopo local confirmado pelo serviço'}
            </p>
          ) : null}
        </div>
        {listAccess?.canCreate === true ? <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 text-xs font-black text-white shadow-lg shadow-blue-900/15 transition hover:bg-blue-700"
        >
          <FilePlus2 size={16} /> Novo responsável
        </button> : null}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar por nome, CPF ou e-mail"
            className="h-10 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
        >
          <option value="todos">Todos os status</option>
          <option value="ATIVO">Ativos</option>
          <option value="INATIVO">Inativos</option>
        </select>
        <button
          type="button"
          onClick={() => void listQuery.refetch()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-[10px] font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {showCreateForm && listAccess?.canCreate === true ? (
        <form onSubmit={submitCreate} className="rounded-3xl border border-blue-100 bg-blue-50/40 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-[#001a33]">Novo responsável</h3>
              <p className="mt-1 text-xs font-medium text-slate-500">Somente o nome é obrigatório. Este passo cria um cadastro pendente; não prepara acesso.</p>
            </div>
            <button type="button" onClick={() => setShowCreateForm(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Fechar cadastro">
              <X size={17} />
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">Nome *
              <input required value={nome} onChange={(event) => setNome(event.target.value)} className={fieldClassName} />
            </label>
            <label className="text-xs font-bold text-slate-600">CPF
              <input value={cpf} onChange={(event) => setCpf(event.target.value)} className={fieldClassName} />
            </label>
            <label className="text-xs font-bold text-slate-600">E-mail
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={fieldClassName} />
            </label>
            <label className="text-xs font-bold text-slate-600">Telefone
              <input value={telefone} onChange={(event) => setTelefone(event.target.value)} className={fieldClassName} />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={saveMutation.isPending} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60">
              {saveMutation.isPending ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}
              Salvar responsável
            </button>
          </div>
        </form>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-sm font-black text-[#001a33]">Cadastros encontrados</p>
          </div>
          {listQuery.isPending ? (
            <div className="flex min-h-52 items-center justify-center gap-3 text-sm font-bold text-slate-500">
              <Loader2 size={20} className="animate-spin text-blue-600" /> Carregando responsáveis…
            </div>
          ) : listQuery.isError ? (
            <div className="p-5">
              <p className="text-sm font-black text-rose-700">Não foi possível carregar responsáveis.</p>
              <button type="button" onClick={() => void listQuery.refetch()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">
                <RefreshCw size={14} /> Tentar novamente
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center">
              <UserRound className="mx-auto text-slate-400" size={25} />
              <p className="mt-3 text-sm font-black text-[#001a33]">Nenhum responsável encontrado</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Cadastre um responsável para iniciar o vínculo com o aluno.</p>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => selectResponsavel(item.id)}
                      className={`flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50 ${selectedId === item.id ? 'bg-blue-50/60' : ''}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-black text-slate-600">
                        {item.nome.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-[#001a33]">{item.nome}</span>
                        <span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {item.status} · {item.dependentesAtivos} dependente{item.dependentesAtivos === 1 ? '' : 's'} ativo{item.dependentesAtivos === 1 ? '' : 's'}
                        </span>
                      </span>
                      {item.eligible ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600" aria-label="Acesso elegível" /> : <ShieldAlert size={18} className="shrink-0 text-amber-500" aria-label="Acesso ainda não elegível" />}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-slate-100 px-5 py-4">
                {listQuery.hasNextPage ? (
                  <button
                    type="button"
                    disabled={listQuery.isFetchingNextPage}
                    onClick={() => void listQuery.fetchNextPage()}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                  >
                    {listQuery.isFetchingNextPage ? <Loader2 className="animate-spin" size={15} /> : <ChevronDown size={15} />}
                    {listQuery.isFetchingNextPage ? 'Carregando mais…' : 'Carregar mais'}
                  </button>
                ) : (
                  <p className="text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">Fim da lista devolvida pelo serviço</p>
                )}
              </div>
            </>
          )}
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          {!selectedId ? (
            <div className="flex min-h-60 flex-col items-center justify-center text-center">
              <UserRound size={27} className="text-slate-400" />
              <p className="mt-3 text-sm font-black text-[#001a33]">Selecione um responsável</p>
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">Os detalhes, vínculos e a situação de acesso aparecem aqui.</p>
            </div>
          ) : detailQuery.isPending ? (
            <div className="flex min-h-60 items-center justify-center gap-3 text-sm font-bold text-slate-500"><Loader2 size={20} className="animate-spin text-blue-600" /> Carregando detalhes…</div>
          ) : detailQuery.isError || !selected ? (
            <div className="min-h-60"><p className="text-sm font-black text-rose-700">Não foi possível carregar este responsável.</p><button type="button" onClick={() => void detailQuery.refetch()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700"><RefreshCw size={14} /> Tentar novamente</button></div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">Responsável legal</p>
                  <h3 className="mt-1 text-lg font-black text-[#001a33]">{selected.nome}</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{selected.email || 'E-mail não informado'}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => beginEditing(selected)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2 text-[10px] font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50"><Pencil size={13} /> Editar</button>
                  <button type="button" onClick={closeDetails} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50" aria-label="Fechar detalhes"><X size={17} /></button>
                </div>
              </div>

              {isEditing ? (
                <form onSubmit={submitEdit} className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
                  <div className="flex items-center justify-between gap-3"><p className="text-xs font-black text-[#001a33]">Editar dados do responsável</p><button type="button" onClick={() => setIsEditing(false)} className="text-[10px] font-black uppercase tracking-wide text-slate-500 hover:text-slate-800">Cancelar</button></div>
                  <div className="mt-3 grid gap-2">
                    <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">Nome *<input required value={editNome} onChange={(event) => setEditNome(event.target.value)} className={fieldClassName} /></label>
                    <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">CPF<input value={editCpf} onChange={(event) => setEditCpf(event.target.value)} className={fieldClassName} /></label>
                    <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">E-mail<input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} className={fieldClassName} /></label>
                    <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">Telefone<input value={editTelefone} onChange={(event) => setEditTelefone(event.target.value)} className={fieldClassName} /></label>
                  </div>
                  <button type="submit" disabled={updateMutation.isPending} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-60">{updateMutation.isPending ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />} Salvar alterações</button>
                </form>
              ) : null}

              <dl className="mt-5 grid gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 p-3"><dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Situação</dt><dd className="mt-1 font-bold text-slate-700">{selected.status}</dd></div>
                <div className="rounded-xl bg-slate-50 p-3"><dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Identidade</dt><dd className="mt-1 font-bold text-slate-700">{selected.identidadeVerificada ? 'Verificação registrada pelo serviço' : 'Pendente de verificação'}</dd></div>
              </dl>

              {canRegisterVerification ? (
                <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-[#001a33]">Verificação e ativação</p><p className="mt-1 text-xs leading-relaxed text-slate-600">Registre o método e a referência/protocolo. O serviço revalida a evidência antes de ativar.</p></div><button type="button" onClick={() => setShowIdentityVerificationForm((value) => !value)} className="text-[10px] font-black uppercase tracking-wide text-blue-700 hover:text-blue-900">{showIdentityVerificationForm ? 'Cancelar' : 'Registrar'}</button></div>
                  {showIdentityVerificationForm ? (
                    <form onSubmit={submitIdentityVerification} className="mt-3">
                      <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">Método *
                        <select required value={identityVerificationMethod} onChange={(event) => setIdentityVerificationMethod(event.target.value as ResponsavelIdentidadeVerificacaoMetodo | '')} className={fieldClassName}>
                          <option value="">Selecione o método</option><option value="DOCUMENTO_CONFERIDO">Documento conferido</option><option value="PRESENCIAL">Conferência presencial</option>
                        </select>
                      </label>
                      <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-slate-500">Referência ou protocolo *
                        <input required minLength={3} maxLength={120} value={identityVerificationReference} onChange={(event) => setIdentityVerificationReference(event.target.value)} className={fieldClassName} placeholder="Ex.: protocolo interno ou referência documental" />
                      </label>
                      {!hasVerificationFields ? <p className="mt-2 text-[10px] font-bold text-amber-700">CPF e e-mail completos são necessários para esta ação.</p> : null}
                      <button type="submit" disabled={!hasVerificationFields || !identityVerificationMethod || !isVerificationReferenceValid(identityVerificationReference) || verifyAndActivateMutation.isPending} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#001a33] px-3 text-[10px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50">{verifyAndActivateMutation.isPending ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />} Registrar verificação e ativar</button>
                    </form>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-black text-slate-700">Verificação não liberada neste escopo</p><p className="mt-1 text-xs leading-relaxed text-slate-500">O serviço autorizou apenas cadastros e vínculos pendentes para este contexto.</p></div>
              )}

              <div className="mt-5 border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-black text-[#001a33]">Vínculos</p><p className="mt-0.5 text-xs font-medium text-slate-500">A situação do vínculo é revalidada pelo backend.</p></div><button type="button" onClick={() => setShowLinkForm((value) => !value)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-blue-200 px-3 text-[10px] font-black uppercase tracking-wide text-blue-700 hover:bg-blue-50"><Link2 size={14} /> Vincular aluno</button></div>
                {showLinkForm ? (
                  <form onSubmit={submitLink} className="mt-3 rounded-2xl bg-slate-50 p-3">
                    <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">Aluno *<select required value={alunoId} onChange={(event) => setAlunoId(event.target.value)} className={fieldClassName} disabled={alunosQuery.isPending || alunosQuery.isError}><option value="">{alunosQuery.isPending ? 'Carregando alunos…' : alunosQuery.isError ? 'Alunos indisponíveis' : 'Selecione o aluno'}</option>{alunosOrdenados.map((aluno) => <option key={aluno.id} value={aluno.id}>{aluno.nome}</option>)}</select></label>
                    {alunosQuery.isError ? <p className="mt-2 text-[10px] font-bold text-rose-700">Não foi possível carregar a lista mínima de alunos. <button type="button" onClick={() => void alunosQuery.refetch()} className="underline">Tentar novamente</button></p> : null}
                    <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-slate-500">Parentesco *<select required value={parentesco} onChange={(event) => setParentesco(event.target.value as Parentesco | '')} className={fieldClassName}><option value="">Selecione o parentesco</option><option value="MAE">Mãe</option><option value="PAI">Pai</option><option value="TUTOR">Tutor(a)</option><option value="GUARDIAO_JUDICIAL">Guardião(ã) judicial</option><option value="OUTRO">Outro</option></select></label>
                    {parentesco === 'OUTRO' ? <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-slate-500">Descrição do parentesco *<input required minLength={2} maxLength={120} value={descricaoOutro} onChange={(event) => setDescricaoOutro(event.target.value)} className={fieldClassName} placeholder="Ex.: madrasta responsável" /></label> : null}
                    {canRegisterVerification ? (
                      <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-slate-500">Situação do vínculo *
                        <select value={linkStatus} onChange={(event) => { const nextStatus = event.target.value as VinculoStatus; setLinkStatus(nextStatus); if (nextStatus !== 'VERIFICADO') { setLinkVerificationMethod(''); setLinkVerificationReference(''); } }} className={fieldClassName}><option value="PENDENTE">Registrar como pendente</option><option value="VERIFICADO">Registrar como verificado</option></select>
                      </label>
                    ) : null}
                    {linkStatus === 'VERIFICADO' && canRegisterVerification ? (
                      <div className="mt-3 rounded-xl border border-blue-100 bg-white p-3">
                        <p className="text-[10px] font-black uppercase tracking-wide text-blue-700">Evidência da verificação</p>
                        <label className="mt-2 block text-[10px] font-black uppercase tracking-wide text-slate-500">Método *<select required value={linkVerificationMethod} onChange={(event) => setLinkVerificationMethod(event.target.value as ResponsavelVinculoVerificacaoMetodo | '')} className={fieldClassName}><option value="">Selecione o método</option><option value="DOCUMENTO_CONFERIDO">Documento conferido</option><option value="DECISAO_JUDICIAL">Decisão judicial</option><option value="PRESENCIAL">Conferência presencial</option></select></label>
                        <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-slate-500">Referência ou protocolo *<input required minLength={3} maxLength={120} value={linkVerificationReference} onChange={(event) => setLinkVerificationReference(event.target.value)} className={fieldClassName} placeholder="Ex.: protocolo interno ou processo" /></label>
                      </div>
                    ) : null}
                    {!canRegisterVerification ? <p className="mt-3 text-[10px] font-bold leading-relaxed text-slate-500">Este escopo registra novos vínculos como pendentes. O serviço poderá liberar verificação em contexto autorizado.</p> : null}
                    <button type="submit" disabled={linkMutation.isPending || !alunoId || !parentesco || (parentesco === 'OUTRO' && (descricaoOutro.trim().length < 2 || descricaoOutro.trim().length > 120)) || (linkStatus === 'VERIFICADO' && !linkVerificationReady)} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-60">{linkMutation.isPending ? <Loader2 className="animate-spin" size={15} /> : <Link2 size={15} />}{linkStatus === 'VERIFICADO' ? 'Registrar vínculo verificado' : 'Enviar vínculo pendente'}</button>
                  </form>
                ) : null}
                <ul className="mt-3 space-y-2">{selected.vinculos.length ? selected.vinculos.map((vinculo) => <li key={vinculo.id} className="rounded-xl border border-slate-100 p-3"><p className="text-xs font-black text-slate-700">{vinculo.alunoNome}</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{vinculo.parentesco}{vinculo.descricaoOutro ? ` · ${vinculo.descricaoOutro}` : ''} · {vinculo.status}</p>{vinculo.verificacaoMetodo ? <p className="mt-1 text-[10px] font-medium text-slate-500">{vinculo.verificacaoMetodo}{vinculo.verificacaoReferencia ? ` · ${vinculo.verificacaoReferencia}` : ''}</p> : null}</li>) : <li className="rounded-xl border border-dashed border-slate-200 p-3 text-xs font-medium text-slate-500">Nenhum vínculo informado pelo serviço.</li>}</ul>
              </div>

              <div className={`mt-5 rounded-2xl border p-4 ${selected.eligible ? 'border-emerald-100 bg-emerald-50/60' : 'border-amber-100 bg-amber-50/60'}`}>
                <div className="flex items-start gap-3"><span className={`mt-0.5 ${selected.eligible ? 'text-emerald-600' : 'text-amber-600'}`}>{selected.eligible ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}</span><div className="min-w-0 flex-1"><p className={`text-xs font-black ${selected.eligible ? 'text-emerald-800' : 'text-amber-800'}`}>{selected.eligible ? 'Acesso liberado pelo serviço' : 'Acesso ainda não liberado'}</p><p className={`mt-1 text-xs font-medium leading-relaxed ${selected.eligible ? 'text-emerald-700' : 'text-amber-700'}`}>{selected.eligible ? 'A Edge Function revalidará as condições antes de preparar o acesso.' : eligibilityMessage(selected.accessBlockReason)}</p>{selected.eligible ? <button type="button" disabled={accessMutation.isPending} onClick={() => prepareAccess(selected)} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-60">{accessMutation.isPending ? <Loader2 className="animate-spin" size={15} /> : <KeyRound size={15} />} Preparar acesso</button> : null}</div></div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
};

export default ResponsaveisTab;
