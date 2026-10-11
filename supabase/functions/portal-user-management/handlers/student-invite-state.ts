import type { HandlerContext, Partner } from "../types.ts";
import type { StudentAccessPatch } from "../student-access.ts";

const SNAPSHOT_FIELDS = [
  "tipo", "status", "email", "cpf_cnpj", "polo_id", "polo_ids", "auth_user_id",
  "auth_login_email", "acesso_status", "troca_senha_obrigatoria",
  "senha_atualizada_em", "senha_temporaria_pendente",
  "senha_temporaria_emitida_em", "senha_temporaria_emissao_id",
  "senha_temporaria_emissao_iniciada_em",
  "senha_temporaria_emissao_senha_alterada_em", "acesso_ativado_em",
  "convite_enviado_em", "aceitou_termos_uso", "termos_uso_versao",
] as const satisfies ReadonlyArray<keyof Partner>;

const CONFLICT_CODES = new Set(["23505", "23514", "40001", "40P01", "55P03"]);
const CONFLICT_MESSAGE =
  "O cadastro ou o acesso do aluno mudou durante o envio. Atualize os dados antes de tentar novamente.";

export type StudentInviteWriteResult = {
  error: string | null;
  status: number;
  alreadyLinked: boolean;
};
export type StudentInviteWriter = (
  patch: StudentAccessPatch,
) => Promise<StudentInviteWriteResult>;

/** Cada UPDATE compara a prova e a identidade no banco, sem preflight separado. */
export const createStudentInviteState = (admin: any, partner: Partner) => {
  const snapshot: Partner = { ...partner };
  let conflicted = false;
  let inviteSent = false;
  let recoveryEmailSent = false;

  const write: StudentInviteWriter = async (patch) => {
    if (conflicted) {
      return { error: CONFLICT_MESSAGE, status: 409, alreadyLinked: false };
    }
    try {
      let query = admin.from("parceiros").update(patch).eq("id", snapshot.id);
      for (const field of SNAPSHOT_FIELDS) {
        const value = snapshot[field];
        query = value == null
          ? query.is(field, null)
          : query.eq(field, Array.isArray(value) ? `{${value.join(",")}}` : value);
      }
      const { data, error } = await query
        .select(["id", ...SNAPSHOT_FIELDS].join(", "))
        .maybeSingle();
      if (error) {
        conflicted = CONFLICT_CODES.has(String(error.code));
        return {
          error: conflicted ? CONFLICT_MESSAGE : error.message || "Falha na atualização do acesso.",
          status: conflicted ? 409 : 500,
          alreadyLinked: false,
        };
      }
      if (!data) {
        conflicted = true;
        return { error: CONFLICT_MESSAGE, status: 409, alreadyLinked: false };
      }
      // Inclui o estado produzido pelos triggers, não só o patch solicitado.
      Object.assign(snapshot, data);
      return { error: null, status: 200, alreadyLinked: false };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Falha na atualização do acesso.",
        status: 500,
        alreadyLinked: false,
      };
    }
  };

  return {
    write,
    markInviteSent: () => { inviteSent = true; },
    markRecoveryEmailSent: () => { recoveryEmailSent = true; },
    delivery: () => ({ inviteSent, recoveryEmailSent, recoveryLink: null }),
    hasConflict: () => conflicted,
    conflictResponse: (context: HandlerContext) => context.json({
      success: false,
      code: "ALUNO_ACESSO_ALTERADO_DURANTE_ENVIO",
      inviteSent,
      recoveryEmailSent,
      recoveryLink: null,
      error: CONFLICT_MESSAGE + (inviteSent || recoveryEmailSent
        ? " O e-mail já foi enviado; seu envio não foi cancelado."
        : ""),
    }, 409),
  };
};

export type StudentInviteState = ReturnType<typeof createStudentInviteState>;
