import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parceirosService } from '../parceiros.service';
import { parceirosQueryKeys } from '../parceiros.query-keys';
import { portalActivationService } from '../portal-activation.service';
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
        // O gestor cadastra o aluno, mas somente o próprio aluno pode aceitar
        // os termos ao validar o convite e concluir o primeiro acesso.
        aceitouTermosUso: false,
        aceitouTermosUsoEm: null,
        termosUsoVersao: null,
        trocaSenhaObrigatoria: true,
      }),
    onSuccess: async (created, data) => {
      invalidatePartners();
      const isExistingAluno = Boolean(created?.existingAluno);
      let inviteDispatched = false;
      let recoverySent = false;
      let lastMessage: string | null = null;
      let manualRecoveryLink: string | null = null;
      let accessPreparationError: string | null = null;

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
          accessPreparationError = error instanceof Error
            ? error.message
            : 'Erro desconhecido.';
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
        } else if (accessPreparationError) {
          toast.error(
            'Cadastro salvo, acesso pendente',
            `O aluno foi cadastrado, mas o acesso não foi preparado: ${accessPreparationError} Abra a aba Acesso do aluno para tentar novamente.`,
          );
        } else if (created?.email && inviteDispatched) {
          toast.success(
            'Aluno cadastrado!',
            lastMessage || `${created.nome} receberá um convite para confirmar o e-mail, aceitar os termos e criar a própria senha.`,
          );
        } else if (created?.email && recoverySent) {
          toast.success('Aluno cadastrado!', `${created.nome} já possuía uma conta. Enviamos um link seguro para definir a senha e concluir o acesso.`);
        } else if (manualRecoveryLink) {
          toast.success(
            'Aluno cadastrado!',
            `${created.nome}: ${lastMessage || 'Geramos um link de recuperação para primeiro acesso.'}`
            + ' Abra a aba Acesso para gerar um novo link quando precisar enviá-lo.',
          );
        } else if (created?.email) {
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
      if (created?.institutionalProfileLinked) {
        toast.success(
          'Professor cadastrado e acesso vinculado!',
          `${created.nome} poderá escolher Professor ou Gestor ao entrar no portal institucional.`,
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
