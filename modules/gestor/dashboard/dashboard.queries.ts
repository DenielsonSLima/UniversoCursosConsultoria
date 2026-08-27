import { queryOptions } from '@tanstack/react-query';
import {
  dashboardService,
  type DashboardKpiRequirements,
} from './dashboard.service';

export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  kpis: (poloId: string, accessKey: string) => [...dashboardQueryKeys.all, poloId, 'kpis', accessKey] as const,
  chart: (poloId: string, accessKey: string) => [...dashboardQueryKeys.all, poloId, 'chart', 6, accessKey] as const,
  activity: (poloId: string, accessKey: string) => [...dashboardQueryKeys.all, poloId, 'activity', 5, accessKey] as const,
};

const requirementsFromAccessKey = (accessKey: string): DashboardKpiRequirements => {
  try {
    const parsed = JSON.parse(accessKey) as { widgets?: unknown };
    const widgets = Array.isArray(parsed.widgets) ? parsed.widgets : [];
    return {
      students: widgets.includes('alunos-ativos'),
      revenue: widgets.includes('receita-mes'),
      delinquency: widgets.includes('inadimplencia'),
      enrollments: widgets.includes('matriculas-mes'),
    };
  } catch {
    return {};
  }
};

export const dashboardKpisQueryOptions = (poloId: string, accessKey = 'legacy') => {
  const requirements = requirementsFromAccessKey(accessKey);
  return queryOptions({
    queryKey: dashboardQueryKeys.kpis(poloId, accessKey),
    queryFn: () => dashboardService.getKpis(poloId, requirements),
  });
};

export const dashboardChartQueryOptions = (poloId: string, accessKey = 'legacy') => queryOptions({
  queryKey: dashboardQueryKeys.chart(poloId, accessKey),
  queryFn: () => dashboardService.getChartData(poloId, 6),
});

export const dashboardActivityQueryOptions = (poloId: string, accessKey = 'legacy') => queryOptions({
  queryKey: dashboardQueryKeys.activity(poloId, accessKey),
  queryFn: () => dashboardService.getRecentActivity(poloId, 5),
});
