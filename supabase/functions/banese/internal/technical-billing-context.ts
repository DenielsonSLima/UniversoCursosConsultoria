import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { BaneseAcademicBillingContext } from "./technical-billing-instructions.ts";

const text = (value: unknown) => String(value ?? "").trim();
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

export const loadBaneseAcademicBillingContext = async (
  admin: SupabaseClient,
  matriculaId: unknown,
  receivableTurmaId: unknown,
): Promise<BaneseAcademicBillingContext | null> => {
  let turmaId = text(receivableTurmaId);
  const enrollmentId = text(matriculaId);

  if (enrollmentId) {
    const { data: enrollment, error: enrollmentError } = await admin
      .from("matriculas")
      .select("turma_id")
      .eq("id", enrollmentId)
      .maybeSingle();
    if (enrollmentError) throw enrollmentError;
    turmaId = text(enrollment?.turma_id) || turmaId;
  }
  if (!turmaId) return null;

  const { data: turma, error: turmaError } = await admin
    .from("turmas")
    .select(`
      codigo, nome, instrucao_boleto_carne,
      curso:cursos!turmas_curso_id_fkey(modalidade)
    `)
    .eq("id", turmaId)
    .maybeSingle();
  if (turmaError) throw turmaError;
  if (!turma) return null;

  const rawCourse = Array.isArray(turma.curso) ? turma.curso[0] : turma.curso;
  const course = asRecord(rawCourse);
  return {
    modality: text(course.modalidade),
    classCode: text(turma.codigo),
    className: text(turma.nome),
    instruction: text(turma.instrucao_boleto_carne),
  };
};
