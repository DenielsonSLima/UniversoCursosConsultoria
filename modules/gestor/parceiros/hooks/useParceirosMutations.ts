import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parceirosService } from '../parceiros.service';
import { parceirosQueryKeys } from '../parceiros.query-keys';
import { portalActivationService } from '../portal-activation.service';
import { TERMS_VERSION } from '../../../shared/constants/terms';
import { buildAuthRedirectUrl } from '../../../../lib/app-url';

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
    mutationFn: (data: any) =>
      parceirosService.create({
        ...data,
        tipo: 'Aluno',
        aceitouTermosUso: true,
        aceitouTermosUsoEm: new Date().toISOString(),
        termosUsoVersao: TERMS_VERSION,
        trocaSenhaObrigatoria: true,
      }),
    onSuccess: async (created, data) => {
      invalidatePartners();
      const isExistingAluno = Boolean(created?.existingAluno);
      let inviteDispatched = false;
      let recoverySent = false;
      let lastMessage: string | null = null;
      let manualRecoveryLink: string | null = null;

      if (created?.id && !isExistingAluno) {
        const redirectTo = buildAuthRedirectUrl('/login');
        try {
          const result = await portalActivationService.ensureStudentAccess({
            partnerId: created.id,
            email: created.email || undefined,
            redirectTo,
          });
          inviteDispatched = result.action === 'invite' ? true : false;
          recoverySent = result.action === 'recovery'
            ? Boolean(result.recoveryEmailSent)
            : false;
          lastMessage = result.message || null;
          manualRecoveryLink = result.recoveryLink || null;
        } catch (error) {
          toast.error(
            'Aluno criado sem convite de acesso',
            `Não foi possível enviar e-mail para definir a primeira senha: ${error instanceof Error ? error.message : 'Erro desconhecido.'}`
          );
        }
      }

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
        } else if (created?.email && inviteDispatched) {
          toast.success(
            'Aluno cadastrado!',
            lastMessage || `${created.nome} foi registrado com sucesso e receberá e-mail para primeiro acesso.`,
          );
        } else if (created?.email && recoverySent) {
          toast.success('Aluno cadastrado!', `${created.nome} foi registrado com sucesso e enviamos o e-mail para definir a senha.`);
        } else if (manualRecoveryLink) {
          toast.success(
            'Aluno cadastrado!',
            `${created.nome}: ${lastMessage || 'Geramos um link de recuperação para primeiro acesso.'}`
            + ' Abra a aba Acesso para copiar e enviar o link com segurança.',
          );
        } else if (created?.email) {
          toast.success(
            'Aluno cadastrado!',
            `${created.nome} foi registrado com sucesso. Não foi possível enviar e-mail automático de primeiro acesso automaticamente; finalize pelo gestor se necessário.`,
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
      toast.success('Professor cadastrado!', `${created.nome} foi registrado com sucesso.`);
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

  const confirmEmailMutation = useMutation({
    mutationFn: (partner: any) => portalActivationService.confirmPartnerEmail(partner.id),
    onSuccess: (result, partner) => {
      invalidatePartners();
      toast.success(
        'E-mail confirmado!',
        result.message || `O e-mail de ${partner.nome} foi confirmado manualmente.`,
      );
    },
    onError: (error: any) => toast.error(
      'Não foi possível confirmar',
      error?.message || 'Tente novamente em alguns instantes.',
    ),
  });

  return {
    saveAlunoMutation,
    saveProfessorMutation,
    savePFMutation,
    savePJMutation,
    enrollAlunoMutation,
    deleteMutation,
    confirmEmailMutation,
  };
};
