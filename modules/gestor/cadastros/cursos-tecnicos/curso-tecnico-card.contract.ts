import type { Curso } from "../cadastros.types";

export type CursoTecnicoCardData = Curso & {
  total_disciplinas: number;
};

const readCanonicalDisciplineCount = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export const normalizeCursosTecnicosCardContract = (
  cursos: Curso[],
): CursoTecnicoCardData[] =>
  cursos.map((curso) => {
    const totalDisciplinas = readCanonicalDisciplineCount(curso.total_disciplinas);
    if (totalDisciplinas === null) {
      throw new Error(
        "O banco não retornou o total de disciplinas dos cursos técnicos. Tente novamente.",
      );
    }

    return {
      ...curso,
      total_disciplinas: totalDisciplinas,
    };
  });
