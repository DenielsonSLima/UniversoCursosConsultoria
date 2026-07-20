import { useQuery } from '@tanstack/react-query';
import { bibliotecaService } from '../biblioteca.service';
import { bibliotecaQueryKeys } from '../biblioteca.queryKeys';

export function useFileExplorerQueries(
  teacherId: string | null,
  currentFolderId: string | null,
  movingItemOpen: boolean,
  isSearching?: boolean
) {
  const foldersQuery = useQuery({
    queryKey: bibliotecaQueryKeys.folders(teacherId, currentFolderId),
    queryFn: () => bibliotecaService.getFolders(currentFolderId, teacherId),
    enabled: !isSearching
  });

  const documentsQuery = useQuery({
    queryKey: bibliotecaQueryKeys.documents(teacherId, currentFolderId),
    queryFn: () => bibliotecaService.getDocuments({ pastaId: currentFolderId, teacherId }),
    enabled: !isSearching
  });

  const searchDocumentsQuery = useQuery({
    queryKey: bibliotecaQueryKeys.searchDocuments(teacherId),
    queryFn: () => bibliotecaService.getDocuments({ teacherId }),
    enabled: !!isSearching
  });

  const allFoldersQuery = useQuery({
    queryKey: bibliotecaQueryKeys.allFoldersMove(teacherId),
    queryFn: () => bibliotecaService.getFoldersForMove(teacherId),
    enabled: movingItemOpen
  });

  return {
    folders: isSearching ? [] : (foldersQuery.data || []),
    documents: isSearching ? (searchDocumentsQuery.data || []) : (documentsQuery.data || []),
    allFolders: allFoldersQuery.data || [],
    isFoldersLoading: !isSearching && foldersQuery.isLoading,
    isDocsLoading: isSearching ? searchDocumentsQuery.isLoading : documentsQuery.isLoading,
  };
}
