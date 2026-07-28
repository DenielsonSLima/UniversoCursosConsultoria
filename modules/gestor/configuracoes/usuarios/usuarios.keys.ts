export const usuariosKeys = {
  all: ['usuarios'] as const,
  polos: () => [...usuariosKeys.all, 'polos'] as const,
  counts: () => [...usuariosKeys.all, 'counts'] as const,
  byContext: (contextId: string) => [...usuariosKeys.all, 'context', contextId] as const,
  management: (contextId: string) => [...usuariosKeys.all, 'management', contextId] as const,
};
