import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface BaneseStudentIdentity {
  id: string;
  auth_user_id: string;
  tipo: string;
  status: string | null;
  nome: string | null;
  cpf_cnpj: string | null;
}

type StudentOwner = Partial<BaneseStudentIdentity>;

const text = (value: unknown) => String(value ?? "").trim();

export const isEligibleBaneseStudentOwner = (
  payer: StudentOwner,
  authenticatedUserId: unknown,
) => {
  const userId = text(authenticatedUserId);
  return Boolean(userId) &&
    text(payer.auth_user_id) === userId &&
    text(payer.tipo).toUpperCase() === "ALUNO" &&
    !["INATIVO", "INACTIVE", "BLOQUEADO", "CANCELADO"].includes(
      text(payer.status).toUpperCase(),
    );
};

export const isUniqueEligibleBaneseStudentOwner = (
  candidates: StudentOwner[],
  payerId: unknown,
  authenticatedUserId: unknown,
) => {
  const id = text(payerId);
  return Boolean(id) && candidates.length === 1 &&
    text(candidates[0].id) === id &&
    isEligibleBaneseStudentOwner(candidates[0], authenticatedUserId);
};

/** Recebe somente o UID devolvido por auth.getUser(token), nunca do body. */
export const readBaneseStudentIdentity = async (
  client: Pick<SupabaseClient, "from">,
  authenticatedUserId: string,
): Promise<BaneseStudentIdentity | null> => {
  const userId = text(authenticatedUserId);
  if (!userId) return null;

  // O client do detalhe mantém o JWT/RLS. Nos PDFs, o client administrativo
  // já existente só libera o documento após conferir UID, estado e pagador.
  const { data, error } = await client.from("parceiros")
    .select("id,auth_user_id,tipo,status,nome,cpf_cnpj")
    .eq("tipo", "Aluno")
    .eq("auth_user_id", userId)
    .limit(2);
  if (error) throw error;

  const candidates = (data ?? []) as BaneseStudentIdentity[];
  const student = candidates[0];
  return student && isUniqueEligibleBaneseStudentOwner(
      candidates,
      student.id,
      userId,
    )
    ? student
    : null;
};
