import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bibliotecaService } from '../biblioteca.service';
import { bibliotecaQueryKeys } from '../biblioteca.queryKeys';

interface UseFileExplorerMutationsParams {
  currentFolderId: string | null;
  teacherId: string | null;
  onFolderCreated: () => void;
  onFolderRenamed: () => void;
  onMoveFinished: () => void;
}

export function useFileExplorerMutations({
  currentFolderId,
  teacherId,
  onFolderCreated,
  onFolderRenamed,
  onMoveFinished
}: UseFileExplorerMutationsParams) {
  const queryClient = useQueryClient();

  const invalidateFolders = () => {
    queryClient.invalidateQueries({ queryKey: bibliotecaQueryKeys.foldersRoot });
    queryClient.invalidateQueries({ queryKey: bibliotecaQueryKeys.allFoldersMoveRoot });
  };

  const invalidateDocuments = () => {
    queryClient.invalidateQueries({ queryKey: bibliotecaQueryKeys.documentsRoot });
  };

  const createFolderMutation = useMutation({
    mutationFn: (nome: string) => bibliotecaService.createFolder(nome, currentFolderId, teacherId),
    onSuccess: () => {
      invalidateFolders();
      onFolderCreated();
    }
  });

  const renameFolderMutation = useMutation({
    mutationFn: ({ id, nome }: { id: string; nome: string }) => bibliotecaService.renameFolder(id, nome),
    onSuccess: () => {
      invalidateFolders();
      onFolderRenamed();
    }
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => bibliotecaService.deleteFolder(id),
    onSuccess: invalidateFolders
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: (id: string) => bibliotecaService.deleteDocument(id),
    onSuccess: invalidateDocuments
  });

  const moveFolderMutation = useMutation({
    mutationFn: ({ id, targetId }: { id: string; targetId: string | null }) => bibliotecaService.moveFolder(id, targetId),
    onSuccess: () => {
      invalidateFolders();
      onMoveFinished();
    }
  });

  const moveDocumentMutation = useMutation({
    mutationFn: ({ id, targetId }: { id: string; targetId: string | null }) => bibliotecaService.moveDocument(id, targetId),
    onSuccess: () => {
      invalidateDocuments();
      onMoveFinished();
    }
  });

  const copyDocumentMutation = useMutation({
    mutationFn: ({ id, targetId }: { id: string; targetId: string | null }) => bibliotecaService.copyDocument(id, targetId),
    onSuccess: () => {
      invalidateDocuments();
      onMoveFinished();
    }
  });

  return {
    createFolderMutation,
    renameFolderMutation,
    deleteFolderMutation,
    deleteDocumentMutation,
    moveFolderMutation,
    moveDocumentMutation,
    copyDocumentMutation,
    invalidateDocuments,
  };
}
