const slugify = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

export const TECHNICAL_LANDING_ROUTE_PATTERN = '/cursos-tecnicos/:cursoSlug/turmas/:turmaId';

export const buildTechnicalLandingPath = (courseName: string, turmaId: string) => (
  `/cursos-tecnicos/${slugify(courseName) || 'curso-tecnico'}/turmas/${encodeURIComponent(turmaId)}`
);
