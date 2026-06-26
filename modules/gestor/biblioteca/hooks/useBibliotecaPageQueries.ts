import { useQuery } from '@tanstack/react-query';
import { bibliotecaService } from '../biblioteca.service';
import { bibliotecaQueryKeys } from '../biblioteca.queryKeys';

type LibraryTab = 'destaques' | 'gerenciador' | 'professores' | 'regras';

export function useBibliotecaPageQueries(activeTab: LibraryTab) {
  const cursosQuery = useQuery({
    queryKey: bibliotecaQueryKeys.courses,
    queryFn: () => bibliotecaService.getCursos(),
    enabled: activeTab === 'regras'
  });

  const turmasQuery = useQuery({
    queryKey: bibliotecaQueryKeys.classes,
    queryFn: () => bibliotecaService.getTurmas(),
    enabled: activeTab === 'regras'
  });

  const disciplinasQuery = useQuery({
    queryKey: bibliotecaQueryKeys.disciplines,
    queryFn: () => bibliotecaService.getDisciplinas(),
    enabled: activeTab === 'regras'
  });

  const allDocsQuery = useQuery({
    queryKey: bibliotecaQueryKeys.rulesDocuments,
    queryFn: () => bibliotecaService.getDocuments(),
    enabled: activeTab === 'regras'
  });

  const topAccessedQuery = useQuery({
    queryKey: bibliotecaQueryKeys.topAccessed,
    queryFn: () => bibliotecaService.getTop10Accessed(),
    enabled: activeTab === 'destaques'
  });

  const topRecentQuery = useQuery({
    queryKey: bibliotecaQueryKeys.topRecent,
    queryFn: () => bibliotecaService.getTop10Recent(),
    enabled: activeTab === 'destaques'
  });

  return {
    cursosList: cursosQuery.data || [],
    turmasList: turmasQuery.data || [],
    disciplinasList: disciplinasQuery.data || [],
    allDocs: allDocsQuery.data || [],
    isAllDocsLoading: allDocsQuery.isLoading,
    topAccessed: topAccessedQuery.data || [],
    isTopLoading: topAccessedQuery.isLoading,
    topRecent: topRecentQuery.data || [],
    isRecentLoading: topRecentQuery.isLoading,
  };
}
