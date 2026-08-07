import { queryOptions } from '@tanstack/react-query';
import { dashboardService } from './dashboard.service';

export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  kpis: (poloId: string, accessKey: string) => [...dashboardQueryKeys.all, poloId, 'kpis', accessKey] as const,
  chart: (poloId: string, accessKey: string) => [...dashboardQueryKeys.all, poloId, 'chart', 6, accessKey] as const,
  activity: (poloId: string, accessKey: string) => [...dashboardQueryKeys.all, poloId, 'activity', 5, accessKey] as const,
};

export const dashboardKpisQueryOptions = (poloId: string, accessKey = 'legacy') => queryOptions({
  queryKey: dashboardQueryKeys.kpis(poloId, accessKey),
  queryFn: () => dashboardService.getKpis(poloId),
});

export const dashboardChartQueryOptions = (poloId: string, accessKey = 'legacy') => queryOptions({
  queryKey: dashboardQueryKeys.chart(poloId, accessKey),
  queryFn: () => dashboardService.getChartData(poloId, 6),
});

export const dashboardActivityQueryOptions = (poloId: string, accessKey = 'legacy') => queryOptions({
  queryKey: dashboardQueryKeys.activity(poloId, accessKey),
  queryFn: () => dashboardService.getRecentActivity(poloId, 5),
});
