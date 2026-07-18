import type { QueryClient } from '@tanstack/react-query';

const root = ['public-technical-landing'] as const;

export const technicalLandingKeys = {
  all: root,
  lists: () => [...root, 'list'] as const,
  list: (limit: number) => [...root, 'list', { limit }] as const,
  details: () => [...root, 'detail'] as const,
  detail: (turmaId?: string) => [...root, 'detail', turmaId || null] as const,
};

export const invalidateTechnicalLandingQueries = (
  queryClient: QueryClient,
) => queryClient.invalidateQueries({ queryKey: technicalLandingKeys.all });
