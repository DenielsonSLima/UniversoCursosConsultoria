const one = (value: unknown) => Array.isArray(value) ? value[0] : value;

export const TECNICO_MODALITY = "TECNICO";
export const ONLINE_MODALIDADES = [
  "EAD",
  "LIVRE",
  "ESPECIALIZACAO",
  "TECNICO",
] as const;

export const normalizeCourseModality = (value: unknown) => String(value || "").toUpperCase();

export const isEadCourseModality = (value: unknown) =>
  normalizeCourseModality(value) === "EAD";

export const isOnlineCourseModality = (value: unknown) =>
  ONLINE_MODALIDADES.includes(normalizeCourseModality(value) as (typeof ONLINE_MODALIDADES)[number]);

const extractCourseModality = (row: any) => {
  const turma = one(row?.turmas);
  const curso = one(turma?.cursos) || one(row?.cursos);
  return normalizeCourseModality(curso?.modalidade);
};

export const isTecnicoCourseModality = (value: unknown) =>
  normalizeCourseModality(value) === TECNICO_MODALITY;

export const resolveMatriculaCourseModality = async (admin: any, matriculaId: string) => {
  const { data, error } = await admin
    .from("matriculas")
    .select("turmas(cursos(modalidade))")
    .eq("id", matriculaId)
    .maybeSingle();
  if (error) throw error;
  return extractCourseModality(data);
};

export const resolveReceivableCourseModality = async (admin: any, receivable: any) => {
  if (receivable?.matricula_id) {
    return resolveMatriculaCourseModality(admin, receivable.matricula_id);
  }

  if (!receivable?.turma_id) return null;

  const { data, error } = await admin
    .from("turmas")
    .select("cursos(modalidade)")
    .eq("id", receivable.turma_id)
    .maybeSingle();
  if (error) throw error;
  return extractCourseModality(data);
};
