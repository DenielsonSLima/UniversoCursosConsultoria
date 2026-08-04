export const publicUnitKeys = {
  all: ['public', 'contact', 'units'] as const,
  list: () => [...publicUnitKeys.all, 'list'] as const,
};
