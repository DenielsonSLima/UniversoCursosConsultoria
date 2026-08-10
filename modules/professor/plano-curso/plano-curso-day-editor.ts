import type { PlanoCursoAula } from '../../shared/plano-curso/plano-curso.types';

export interface PlanoCursoDiaEditor {
  dataAula: string;
  dataExibicao: string;
  aulaIds: string[];
  titulos: string[];
  conteudo: string;
  possuiConteudosDivergentes: boolean;
}

export const PLANO_CURSO_DAYS_PER_PAGE = 3;

const uniqueNonEmpty = (values: string[]) => Array.from(new Set(
  values.map((value) => value.trim()).filter(Boolean),
));

export const groupPlanoCursoAulasByDay = (
  aulas: PlanoCursoAula[],
): PlanoCursoDiaEditor[] => {
  const groups = new Map<string, {
    dataExibicao: string;
    aulaIds: string[];
    titulos: string[];
    conteudos: string[];
  }>();

  aulas.forEach((aula) => {
    const current = groups.get(aula.dataAula);
    if (current) {
      current.aulaIds.push(aula.aulaId);
      current.titulos.push(aula.titulo);
      current.conteudos.push(aula.conteudo);
      return;
    }

    groups.set(aula.dataAula, {
      dataExibicao: aula.dataExibicao,
      aulaIds: [aula.aulaId],
      titulos: [aula.titulo],
      conteudos: [aula.conteudo],
    });
  });

  return Array.from(groups, ([dataAula, group]) => {
    const conteudos = uniqueNonEmpty(group.conteudos);
    return {
      dataAula,
      dataExibicao: group.dataExibicao,
      aulaIds: group.aulaIds,
      titulos: uniqueNonEmpty(group.titulos),
      conteudo: conteudos.join('\n\n'),
      possuiConteudosDivergentes: conteudos.length > 1,
    };
  });
};

export const paginatePlanoCursoDays = (
  days: PlanoCursoDiaEditor[],
  pageSize = PLANO_CURSO_DAYS_PER_PAGE,
): PlanoCursoDiaEditor[][] => {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error('A quantidade de dias por página deve ser um inteiro positivo.');
  }

  const pages: PlanoCursoDiaEditor[][] = [];
  for (let index = 0; index < days.length; index += pageSize) {
    pages.push(days.slice(index, index + pageSize));
  }
  return pages;
};

export const expandPlanoCursoConteudosByDay = (
  aulas: PlanoCursoAula[],
  conteudosPorDia: Record<string, string>,
  diasEditados: ReadonlySet<string>,
) => aulas
  .map((aula) => ({
    aulaId: aula.aulaId,
    conteudo: (
      diasEditados.has(aula.dataAula)
        ? conteudosPorDia[aula.dataAula]
        : aula.conteudo
    )?.trim() || '',
  }))
  .filter((item) => item.conteudo.length > 0);
