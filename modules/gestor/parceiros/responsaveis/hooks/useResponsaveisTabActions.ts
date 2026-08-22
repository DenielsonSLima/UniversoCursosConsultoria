import { useEffect, useRef, useState } from 'react';
import type { Dispatch, FormEventHandler, SetStateAction } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ResponsavelIdentidadeVerificacaoMetodo,
  ResponsavelLegalDetalhe,
  ResponsaveisLegaisScope,
  ResponsavelVinculoVerificacaoMetodo,
} from '../responsaveis.contract';
import { responsaveisLegaisQueryKeys } from '../responsaveis.query-keys';
import { responsaveisLegaisService } from '../responsaveis.service';
import {
  getStableRequestId,
  isVerificationReferenceValid,
} from '../responsaveis-tab.helpers';
import type {
  Parentesco,
  ToastApi,
  VinculoStatus,
} from '../responsaveis-tab.types';

interface UseResponsaveisTabActionsParams {
  queryScope: ResponsaveisLegaisScope | null;
  scopeIdentity: string;
  selectedId: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  showLinkForm: boolean;
  setShowLinkForm: Dispatch<SetStateAction<boolean>>;
  selected: ResponsavelLegalDetalhe | null;
  canRegisterVerification: boolean;
  hasVerificationFields: boolean;
  toast: ToastApi;
}

export const useResponsaveisTabActions = ({
  queryScope,
  scopeIdentity,
  selectedId,
  setSelectedId,
  showLinkForm,
  setShowLinkForm,
  selected,
  canRegisterVerification,
  hasVerificationFields,
  toast,
}: UseResponsaveisTabActionsParams) => {
  const queryClient = useQueryClient();
  const mutationRequestIdsRef = useRef(new Map<string, string>());
  const activeScopeIdentityRef = useRef(scopeIdentity);
  activeScopeIdentityRef.current = scopeIdentity;

  const [showCreateForm, setShowCreateForm] = useState(false);
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
  }, [scopeIdentity, setSelectedId, setShowLinkForm]);

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
      toast.success(
        'Verificação registrada',
        'A solicitação de ativação foi enviada ao serviço com o método e a referência informados.',
      );
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

  const linkVerificationReady = linkStatus === 'VERIFICADO'
    && Boolean(linkVerificationMethod)
    && isVerificationReferenceValid(linkVerificationReference);

  const submitCreate: FormEventHandler = (event) => {
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

  const submitEdit: FormEventHandler = (event) => {
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

  const submitIdentityVerification: FormEventHandler = (event) => {
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

  const submitLink: FormEventHandler = (event) => {
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

  return {
    creation: {
      isVisible: showCreateForm,
      setVisible: setShowCreateForm,
      nome,
      setNome,
      cpf,
      setCpf,
      email,
      setEmail,
      telefone,
      setTelefone,
      submit: submitCreate,
      isPending: saveMutation.isPending,
    },
    editing: {
      isVisible: isEditing,
      setVisible: setIsEditing,
      nome: editNome,
      setNome: setEditNome,
      cpf: editCpf,
      setCpf: setEditCpf,
      email: editEmail,
      setEmail: setEditEmail,
      telefone: editTelefone,
      setTelefone: setEditTelefone,
      begin: beginEditing,
      submit: submitEdit,
      isPending: updateMutation.isPending,
    },
    identityVerification: {
      isVisible: showIdentityVerificationForm,
      setVisible: setShowIdentityVerificationForm,
      method: identityVerificationMethod,
      setMethod: setIdentityVerificationMethod,
      reference: identityVerificationReference,
      setReference: setIdentityVerificationReference,
      submit: submitIdentityVerification,
      isPending: verifyAndActivateMutation.isPending,
    },
    linking: {
      isVisible: showLinkForm,
      setVisible: setShowLinkForm,
      alunoId,
      setAlunoId,
      parentesco,
      setParentesco,
      descricaoOutro,
      setDescricaoOutro,
      status: linkStatus,
      setStatus: setLinkStatus,
      verificationMethod: linkVerificationMethod,
      setVerificationMethod: setLinkVerificationMethod,
      verificationReference: linkVerificationReference,
      setVerificationReference: setLinkVerificationReference,
      verificationReady: linkVerificationReady,
      submit: submitLink,
      isPending: linkMutation.isPending,
    },
    selectResponsavel,
    closeDetails,
  };
};

export type ResponsaveisTabActions = ReturnType<typeof useResponsaveisTabActions>;
