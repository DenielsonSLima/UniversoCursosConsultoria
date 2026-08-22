import type { Curso } from "../cadastros.types";

export type CursoTecnicoCardData = Curso & {
  total_disciplinas: number;
};

export const normalizeCursosTecnicosCardContract = (
  cursos: Curso[],
): CursoTecnicoCardData[] =>
  cursos.map((curso) => {
    const totalDisciplinas = Number(curso.total_disciplinas);
    if (!Number.isSafeInteger(totalDisciplinas) || totalDisciplinas < 0) {
      throw new Error(
        "O banco não retornou o total de disciplinas dos cursos técnicos. Tente novamente.",
      );
    }

    return {
      ...curso,
      total_disciplinas: totalDisciplinas,
    };
  });
