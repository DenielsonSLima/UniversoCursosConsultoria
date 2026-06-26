import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cursosEadQueryKeys, cursosEadService, EadCoursesListParams } from '../cursos-ead.service';

export const useCursosEadQueries = (params: EadCoursesListParams) => {
  const queryClient = useQueryClient();

  const dashboardQuery = useQuery<any>({
    queryKey: cursosEadQueryKeys.dashboard,
    queryFn: cursosEadService.getDashboard,
    staleTime: 15000
  });

  const groupedCoursesQuery = useQuery<any>({
    queryKey: cursosEadQueryKeys.list(params),
    queryFn: () => cursosEadService.getCoursesList(params),
    staleTime: 10000
  });

  const areaOptionsQuery = useQuery<string[]>({
    queryKey: cursosEadQueryKeys.areas,
    queryFn: cursosEadService.getAreaOptions,
    staleTime: 60000
  });

  const invalidateEadQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: cursosEadQueryKeys.dashboard });
    queryClient.invalidateQueries({ queryKey: cursosEadQueryKeys.listRoot });
    queryClient.invalidateQueries({ queryKey: cursosEadQueryKeys.areas });
  }, [queryClient]);

  return {
    dashboardQuery,
    groupedCoursesQuery,
    areaOptionsQuery,
    invalidateEadQueries,
  };
};
