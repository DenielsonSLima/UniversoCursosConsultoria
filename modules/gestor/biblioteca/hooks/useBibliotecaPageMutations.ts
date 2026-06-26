import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bibliotecaService } from '../biblioteca.service';
import { bibliotecaQueryKeys } from '../biblioteca.queryKeys';

export function useBibliotecaPageMutations() {
  const queryClient = useQueryClient();

  const invalidateDocuments = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: bibliotecaQueryKeys.documentsRoot });
    queryClient.invalidateQueries({ queryKey: bibliotecaQueryKeys.rulesDocuments });
  }, [queryClient]);

  const invalidateHighlights = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: bibliotecaQueryKeys.topAccessed });
    queryClient.invalidateQueries({ queryKey: bibliotecaQueryKeys.topRecent });
  }, [queryClient]);

  const invalidateTeacherRepositories = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: bibliotecaQueryKeys.teacherRepositories });
  }, [queryClient]);

  const uploadMutation = useMutation({
    mutationFn: (uploadData: any) => bibliotecaService.uploadDocument(uploadData),
    onSuccess: () => {
      invalidateDocuments();
      invalidateHighlights();
      invalidateTeacherRepositories();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bibliotecaService.deleteDocument(id),
    onSuccess: () => {
      invalidateDocuments();
      invalidateHighlights();
    }
  });

  return {
    uploadMutation,
    deleteMutation,
    invalidateDocuments,
    invalidateHighlights,
  };
}
