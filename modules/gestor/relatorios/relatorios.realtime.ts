const RELEVANT_SOURCES = new Set([
  'matriculas',
  'turmas',
  'parceiros',
  'cursos',
  'polos',
]);

export const isRelatoriosRealtimeSource = (source: unknown) =>
  RELEVANT_SOURCES.has(String(source || ''));
