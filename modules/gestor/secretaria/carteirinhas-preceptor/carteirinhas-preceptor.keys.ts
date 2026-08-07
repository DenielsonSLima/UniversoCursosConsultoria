export const carteirinhasPreceptorKeys = {
  all: ['secretaria', 'carteirinhas-preceptor'] as const,
  polo: (poloId: string) => [...carteirinhasPreceptorKeys.all, 'polo', poloId] as const,
  workspace: (poloId: string) => [...carteirinhasPreceptorKeys.polo(poloId), 'workspace'] as const,
};
