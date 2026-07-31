import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { dependenciasAcademicasKeys } from '../dependencias-academicas.keys';
import { dependenciasAcademicasService } from '../dependencias-academicas.service';
import type { DependenciaPreviaInput } from '../dependencias-academicas.types';

export const useDependenciasWorkspaceQuery = (poloId: string) => useQuery({
  queryKey: dependenciasAcademicasKeys.workspace(poloId),
  queryFn: () => dependenciasAcademicasService.getWorkspace(poloId),
  enabled: Boolean(poloId),
  staleTime: 20_000,
  placeholderData: keepPreviousData,
});

export const useDependenciaOfertasQuery = (
  poloId: string,
  matriculaId: string | null,
  disciplinaId: string | null,
) => useQuery({
  queryKey: dependenciasAcademicasKeys.ofertas(
    poloId,
    matriculaId || 'sem-matricula',
    disciplinaId || 'sem-disciplina',
  ),
  queryFn: () => dependenciasAcademicasService.getOfertas(matriculaId!, disciplinaId!),
  enabled: Boolean(poloId && matriculaId && disciplinaId),
  staleTime: 30_000,
});

export const useDependenciaPreviaQuery = (
  input: DependenciaPreviaInput | null,
  enabled: boolean,
) => useQuery({
  queryKey: input
    ? dependenciasAcademicasKeys.previa(
        input.poloId,
        input.matriculaId,
        input.disciplinaId,
        input.turmaDestinoId,
        input.dataVencimento,
      )
    : [...dependenciasAcademicasKeys.all, 'previa', 'inativa'],
  queryFn: () => dependenciasAcademicasService.prever(input!),
  enabled: Boolean(enabled && input),
  staleTime: 15_000,
  retry: 1,
});
