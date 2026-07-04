import type { QueryClient } from '@tanstack/react-query';
import type { SiteTickerModality, SiteTickerPhraseCategory } from './siteTicker.service';

const gestorSiteTickerRoot = ['gestor-site-publico-ticker'] as const;

const normalizeListKey = <T extends string>(values: readonly T[] = []) =>
  Array.from(new Set(values)).sort();

export const siteTickerKeys = {
  public: ['site-public-ticker'] as const,
  gestor: {
    all: gestorSiteTickerRoot,
    config: () => [...gestorSiteTickerRoot, 'config'] as const,
    cursos: (modalidades: readonly SiteTickerModality[]) =>
      [...gestorSiteTickerRoot, 'cursos', { modalidades: normalizeListKey(modalidades) }] as const,
    turmas: (modalidades: readonly SiteTickerModality[], cursoIds: readonly string[]) =>
      [
        ...gestorSiteTickerRoot,
        'turmas',
        {
          modalidades: normalizeListKey(modalidades),
          cursoIds: normalizeListKey(cursoIds),
        },
      ] as const,
    frases: (category: SiteTickerPhraseCategory) =>
      [...gestorSiteTickerRoot, 'frases', { category }] as const,
  },
};

export const invalidateSiteTickerQueries = async (queryClient: QueryClient) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: siteTickerKeys.gestor.all }),
    queryClient.invalidateQueries({ queryKey: siteTickerKeys.public }),
  ]);
};
