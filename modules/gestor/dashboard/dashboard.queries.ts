import { queryOptions } from '@tanstack/react-query';
import { dashboardService } from './dashboard.service';

export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  kpis: (poloId: string) => [...dashboardQueryKeys.all, poloId, 'kpis'] as const,
  chart: (poloId: string) => [...dashboardQueryKeys.all, poloId, 'chart', 6] as const,
  activity: (poloId: string) => [...dashboardQueryKeys.all, poloId, 'activity', 5] as const,
};

export const dashboardKpisQueryOptions = (poloId: string) => queryOptions({
  queryKey: dashboardQueryKeys.kpis(poloId),
  queryFn: () => dashboardService.getKpis(poloId),
});

export const dashboardChartQueryOptions = (poloId: string) => queryOptions({
  queryKey: dashboardQueryKeys.chart(poloId),
  queryFn: () => dashboardService.getChartData(poloId, 6),
});

export const dashboardActivityQueryOptions = (poloId: string) => queryOptions({
  queryKey: dashboardQueryKeys.activity(poloId),
  queryFn: () => dashboardService.getRecentActivity(poloId, 5),
});
