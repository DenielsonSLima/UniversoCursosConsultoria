import type { CalendarioAulasModalidade } from './types';

const scopeValue = (value?: string | null, fallback = 'sem-escopo') => (
  value?.trim() || fallback
);

/**
 * As chaves preservam a cadeia polo → modalidade → turma. Assim, uma grade
 * de uma turma não invalida listas nem exportações de outros polos.
 */
export const calendarioAulasExportacaoQueryKeys = {
  all: ['gestor', 'calendario', 'exportacao-aulas'] as const,
  modulos: (
    poloId?: string | null,
    modalidade?: CalendarioAulasModalidade | null,
    turmaId?: string | null,
  ) => [
    'gestor',
    'calendario',
    'exportacao-aulas',
    'modulos',
    scopeValue(poloId, 'sem-polo'),
    modalidade || 'sem-modalidade',
    scopeValue(turmaId, 'sem-turma'),
  ] as const,
  turmas: (
    poloId?: string | null,
    modalidade?: CalendarioAulasModalidade | null,
  ) => [
    'gestor',
    'calendario',
    'exportacao-aulas',
    'turmas',
    scopeValue(poloId, 'sem-polo'),
    modalidade || 'sem-modalidade',
  ] as const,
  documento: (
    poloId?: string | null,
    modalidade?: CalendarioAulasModalidade | null,
    turmaId?: string | null,
    mesReferencia?: string | null,
  ) => [
    'gestor',
    'calendario',
    'exportacao-aulas',
    'documento',
    scopeValue(poloId, 'sem-polo'),
    modalidade || 'sem-modalidade',
    scopeValue(turmaId, 'sem-turma'),
    scopeValue(mesReferencia, 'sem-mes'),
  ] as const,
};
