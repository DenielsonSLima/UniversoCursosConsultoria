import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parceirosService } from '../parceiros.service';
import { parceirosQueryKeys } from '../parceiros.query-keys';
import {
  portalActivationService,
  type InviteStudentResult,
} from '../portal-activation.service';
import { buildConfiguredAuthRedirectUrl } from '../../../../lib/app-url';

interface ToastApi {
  success: (title: string, message: string) => void;
  error: (title: string, message: string) => void;
}

interface UseParceirosMutationsParams {
  toast: ToastApi;
  createdAlunoNome: string;
  setCreatedAlunoNome: (value: string) => void;
  setShowForm: (value: 'aluno' | 'professor' | 'selection' | 'pf' | 'pj' | null) => void;
  setShowEnrollmentModalForAlunoId: (value: string | null) => void;
  setSelectedTurmaIdForEnrollment: (value: string) => void;
  setDeletingParceiro: (value: any | null) => void;
}

export const useParceirosMutations = ({
  toast,
  createdAlunoNome,
  setCreatedAlunoNome,
  setShowForm,
  setShowEnrollmentModalForAlunoId,
  setSelectedTurmaIdForEnrollment,
  setDeletingParceiro,
}: UseParceirosMutationsParams) => {
    const queryClient = useQueryClient();

  const invalidatePartners = () => {
    queryClient.invalidateQueries({ queryKey: parceirosQueryKeys.all });
  };

  const saveAlunoMutation = useMutation({
    mutationFn: (data: any) => {
      const alunoData = { ...data };

      // Identidade, status de acesso e aceite jurídico pertencem somente ao
      // fluxo autorizado de convite/primeiro acesso, nunca ao INSERT do gestor.
      for (const field of [
        'authUserId',
        'auth_user_id',
        'authLoginEmail',
        'auth_login_email',
        'matriculaAcesso',
        'matricula_acesso',
        'trocaSenhaObrigatoria',
        'troca_senha_obrigatoria',
        'acessoStatus',
        'acesso_status',
        'acessoErro',
        'acesso_erro',
        'conviteEnviadoEm',
        'convite_enviado_em',
        'acessoAtivadoEm',
        'acesso_ativado_em',
        'aceitouTermosUso',
        'aceitou_termos_uso',
        'aceitouTermosUsoEm',
        'aceitou_termos_uso_em',
        'termosUsoVersao',
        'termos_uso_versao',
      ]) {
        delete alunoData[field];
      }

      return parceirosService.create({ ...alunoData, tipo: 'Aluno' });
    },
    onSuccess: async (created, data) => {
      invalidatePartners();
      const isExistingAluno = Boolean(created?.existingAluno);
      let studentAccessResult: InviteStudentResult | null = null;
      let accessPreparationError: string | null = null;

      if (created?.id && !isExistingAluno) {
        const redirectTo = buildConfiguredAuthRedirectUrl('/login');
        try {
          const result = await portalActivationService.ensureStudentAccess({
            partnerId: created.id,
            email: created.email || undefined,
            redirectTo,
          });
          studentAccessResult = result;
        } catch (error) {
          accessPreparationError = error instanceof Error
            ? error.message
            : 'Erro desconhecido.';
        }
      }

      const studentAccessAction = studentAccessResult?.action;
      const studentProfileLinked = studentAccessResult?.profileLinked === true
        || studentAccessResult?.profileLinkState === 'linked'
        || studentAccessResult?.profileLinkState === 'already_linked';
      const studentIdentityLinkedOrReconciled = studentProfileLinked
        || studentAccessAction === 'link-existing-identity'
        || studentAccessAction === 'reconcile-invite';
      const studentAccessPending = studentAccessResult?.studentAccessPending === true;
      const accessMessage = studentAccessResult?.message || null;
      const manualRecoveryLink = studentAccessResult?.recoveryLink || null;

      if (data.matricularAgora) {
        setCreatedAlunoNome(created.nome);
        setShowEnrollmentModalForAlunoId(created.id);
        if (isExistingAluno) {
          toast.success(
            'Aluno localizado',
            `${created.nome} já estava cadastrado. Escolha a turma para vincular ao polo atual.`,
          );
        }
      } else {
        if (isExistingAluno) {
          toast.success(
            'Aluno já cadastrado',
            `${created.nome} foi localizado. Para aparecer neste polo, vincule o aluno a uma turma deste polo.`,
          );
        } else if (accessPreparationError) {
          toast.error(
            'Cadastro salvo, acesso pendente',
            `O aluno foi cadastrado, mas o acesso não foi preparado: ${accessPreparationError} Abra a aba Acesso do aluno para tentar novamente.`,
          );
        } else if (studentIdentityLinkedOrReconciled) {
          toast.success(
            studentAccessPending
              ? 'Cadastro salvo, acesso vinculado e pendente'
              : studentAccessAction === 'reconcile-invite'
                ? 'Aluno cadastrado e acesso reconciliado!'
                : 'Aluno cadastrado e acesso vinculado!',
            accessMessage || (studentAccessPending
              ? `${created.nome} teve a identidade vinculada, mas o primeiro acesso ainda precisa ser concluído.`
              : studentAccessAction === 'reconcile-invite'
                ? `O acesso de ${created.nome} foi reconciliado e vinculado ao perfil de Aluno.`
                : `O acesso existente foi vinculado ao perfil de Aluno de ${created.nome}.`),
          );
        } else if (studentAccessAction === 'invite') {
          toast.success(
            'Aluno cadastrado e convite enviado!',
            accessMessage || `${created.nome} receberá um convite para confirmar o e-mail, aceitar os termos e criar a própria senha.`,
          );
        } else if (
          studentAccessAction === 'recovery'
          && studentAccessResult?.recoveryEmailSent
        ) {
          toast.success(
            'Aluno cadastrado e recuperação enviada!',
            accessMessage || `${created.nome} já possuía uma conta. Enviamos um link seguro para concluir o acesso.`,
          );
        } else if (studentAccessAction === 'recovery' && manualRecoveryLink) {
          toast.success(
            'Aluno cadastrado!',
            `${created.nome}: ${accessMessage || 'Geramos um link de recuperação para primeiro acesso.'}`
            + ' Abra a aba Acesso para gerar um novo link quando precisar enviá-lo.',
          );
        } else if (studentAccessAction === 'recovery') {
          toast.success(
            'Aluno cadastrado, recuperação preparada',
            accessMessage || `A recuperação de acesso de ${created.nome} foi preparada.`,
          );
        } else if (studentAccessResult?.message) {
          toast.success('Aluno cadastrado!', studentAccessResult.message);
        } else if (created?.email && !studentAccessResult) {
          toast.success(
            'Cadastro salvo, acesso pendente',
            `${created.nome} foi cadastrado, mas ainda precisa receber o convite. Abra a aba Acesso do aluno para reenviar.`,
          );
        } else {
          toast.success('Aluno cadastrado!', `${created.nome} foi registrado com sucesso.`);
        }
      }
      setShowForm(null);
    },
    onError: (error: any) => toast.error('Erro ao salvar aluno', error?.message || 'Verifique se o CPF já está cadastrado.')
  });

  const saveProfessorMutation = useMutation({
    mutationFn: (data: any) => parceirosService.create({ ...data, tipo: 'Professor' }),
    onSuccess: (created) => {
      invalidatePartners();
      if (created?.professorAccessInviteSent) {
        toast.success(
          'Professor cadastrado e convite enviado!',
          created.institutionalProfileLinkMessage || `${created.nome} receberá um e-mail para criar a própria senha de acesso.`,
        );
      } else if (created?.institutionalProfileLinked) {
        toast.success(
          created?.institutionalAccessPending
            ? 'Professor cadastrado, primeiro acesso pendente'
            : 'Professor cadastrado e acesso vinculado!',
          created.institutionalProfileLinkMessage
            || `${created.nome} poderá escolher Professor ou Gestor ao entrar no portal institucional.`,
        );
      } else if (created?.institutionalProfileLinkError) {
        toast.error(
          'Professor cadastrado, acesso pendente',
          `O cadastro foi salvo, mas o vínculo com o acesso institucional não foi concluído: ${created.institutionalProfileLinkError}`,
        );
      } else if (created?.institutionalProfileLinkState === 'requires_global_configuration_access') {
        toast.success(
          'Professor cadastrado',
          created?.institutionalProfileLinkMessage || `${created.nome} foi registrado. Caso também seja Gestor, um gestor global com acesso a Configurações deve concluir o vínculo de acesso.`,
        );
      } else {
        toast.success('Professor cadastrado!', `${created.nome} foi registrado com sucesso.`);
      }
      setShowForm(null);
    },
    onError: () => toast.error('Erro ao salvar professor', 'Verifique se o CPF já está cadastrado.')
  });

  const savePFMutation = useMutation({
    mutationFn: (data: any) => parceirosService.create({ ...data, tipo: 'PF' }),
    onSuccess: (created) => {
      invalidatePartners();
      toast.success('Parceiro PF cadastrado!', `${created.nome} foi registrado com sucesso.`);
      setShowForm(null);
    },
    onError: () => toast.error('Erro ao salvar parceiro', 'Verifique os dados e tente novamente.')
  });

  const savePJMutation = useMutation({
    mutationFn: (data: any) => parceirosService.create({ ...data, tipo: 'PJ' }),
    onSuccess: (created) => {
      invalidatePartners();
      toast.success('Parceiro PJ cadastrado!', `${created.nome} foi registrado com sucesso.`);
      setShowForm(null);
    },
    onError: () => toast.error('Erro ao salvar parceiro', 'Verifique os dados e tente novamente.')
  });

  const enrollAlunoMutation = useMutation({
    mutationFn: ({ alunoId, turmaId }: { alunoId: string, turmaId: string }) =>
      parceirosService.matricularAluno(alunoId, turmaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: parceirosQueryKeys.matriculas });
      queryClient.invalidateQueries({ queryKey: parceirosQueryKeys.all });
      setShowEnrollmentModalForAlunoId(null);
      setSelectedTurmaIdForEnrollment('');
      toast.success('Matrícula efetuada!', `${createdAlunoNome} foi matriculado(a) com sucesso.`);
    },
    onError: () => toast.error('Erro na matrícula', 'Não foi possível realizar a matrícula.')
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => parceirosService.delete(id),
    onSuccess: (result: any) => {
      invalidatePartners();
      toast.success(
        result?.partnerDeactivated ? 'Parceiro inativado' : 'Parceiro excluído!',
        result?.message || 'A operação foi concluída com sucesso.',
      );
      setDeletingParceiro(null);
    },
    onError: (error: any) => toast.error('Erro ao excluir', error?.message || 'Não foi possível remover o registro.')
  });

  return {
    saveAlunoMutation,
    saveProfessorMutation,
    savePFMutation,
    savePJMutation,
    enrollAlunoMutation,
    deleteMutation,
  };
};
