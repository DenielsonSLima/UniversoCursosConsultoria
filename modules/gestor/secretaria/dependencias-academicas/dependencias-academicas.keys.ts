export const dependenciasAcademicasKeys = {
  all: ['secretaria', 'dependencias-academicas'] as const,
  polo: (poloId: string) => [...dependenciasAcademicasKeys.all, 'polo', poloId] as const,
  workspace: (poloId: string) => [
    ...dependenciasAcademicasKeys.polo(poloId),
    'workspace',
  ] as const,
  ofertasRoot: (poloId: string) => [
    ...dependenciasAcademicasKeys.polo(poloId),
    'ofertas',
  ] as const,
  ofertas: (poloId: string, matriculaId: string, disciplinaId: string) => [
    ...dependenciasAcademicasKeys.ofertasRoot(poloId),
    matriculaId,
    disciplinaId,
  ] as const,
  previa: (
    poloId: string,
    matriculaId: string,
    disciplinaId: string,
    turmaDestinoId: string,
    dataVencimento: string,
  ) => [
    ...dependenciasAcademicasKeys.polo(poloId),
    'previa',
    matriculaId,
    disciplinaId,
    turmaDestinoId,
    dataVencimento,
  ] as const,
  recebiveis: (poloId: string) => [
    ...dependenciasAcademicasKeys.polo(poloId),
    'recebiveis',
  ] as const,
};
