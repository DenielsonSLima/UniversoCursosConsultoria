import { useMutation } from '@tanstack/react-query';
import {
  CreateCursoPresencialInput,
  ShowCursoPresencialToast,
  useCursosPresenciaisMutations,
} from '../../hooks/useCursosPresenciaisMutations';
import {
  CursoLivreStatusFilter,
  cursosLivresService,
} from '../cursos-livres.service';

export type CreateCursoLivreInput = CreateCursoPresencialInput;

interface UseCursosLivresMutationsParams {
  invalidateCursosLivres: () => void;
  showToast: ShowCursoPresencialToast;
  resetCreateForm: () => void;
  closeDuplicateModal: () => void;
  setIsCreatingCurso: (value: boolean) => void;
  setIsDuplicating: (value: boolean) => void;
}

export function useCursosLivresMutations({
  invalidateCursosLivres,
  showToast,
  resetCreateForm,
  closeDuplicateModal,
  setIsCreatingCurso,
  setIsDuplicating,
}: UseCursosLivresMutationsParams) {
  const baseMutations = useCursosPresenciaisMutations<CursoLivreStatusFilter>({
    service: cursosLivresService,
    invalidateCursos: invalidateCursosLivres,
    showToast,
    resetCreateForm,
    closeDuplicateModal,
    setIsCreatingCurso,
    setIsDuplicating,
    messages: {
      created: 'Curso livre criado com sucesso!',
      createError: 'Erro ao criar curso livre no Supabase.',
      duplicated: 'Curso e grade curricular duplicados com sucesso!',
      duplicateError: 'Erro ao duplicar curso.',
      statusChanged: (status) => `Curso ${status === 'inativo' ? 'inativado' : 'ativado'} com sucesso!`,
      statusError: 'Erro ao alterar status do curso.',
      deleted: 'Curso livre excluído com sucesso!',
      deleteError: 'Erro ao excluir o curso.',
    },
  });

  const uploadImagemMutation = useMutation({
    mutationFn: (file: File) => cursosLivresService.uploadImagem(file),
    onError: (err: any) => {
      console.error('Erro ao fazer upload da imagem:', err);
      showToast('Erro ao fazer upload da imagem: ' + err.message, 'error');
    }
  });

  return {
    ...baseMutations,
    uploadImagemMutation
  };
}
