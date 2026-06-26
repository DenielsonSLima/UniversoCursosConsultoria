import { useQuery } from '@tanstack/react-query';
import { bibliotecaService } from '../biblioteca.service';
import { bibliotecaQueryKeys } from '../biblioteca.queryKeys';

export function useFileExplorerQueries(
  teacherId: string | null,
  currentFolderId: string | null,
  movingItemOpen: boolean
) {
  const foldersQuery = useQuery({
    queryKey: bibliotecaQueryKeys.folders(teacherId, currentFolderId),
    queryFn: () => bibliotecaService.getFolders(currentFolderId, teacherId)
  });

  const documentsQuery = useQuery({
    queryKey: bibliotecaQueryKeys.documents(teacherId, currentFolderId),
    queryFn: () => bibliotecaService.getDocuments({ pastaId: currentFolderId, teacherId })
  });

  const allFoldersQuery = useQuery({
    queryKey: bibliotecaQueryKeys.allFoldersMove(teacherId),
    queryFn: () => bibliotecaService.getFoldersForMove(teacherId),
    enabled: movingItemOpen
  });

  return {
    folders: foldersQuery.data || [],
    documents: documentsQuery.data || [],
    allFolders: allFoldersQuery.data || [],
    isFoldersLoading: foldersQuery.isLoading,
    isDocsLoading: documentsQuery.isLoading,
  };
}
