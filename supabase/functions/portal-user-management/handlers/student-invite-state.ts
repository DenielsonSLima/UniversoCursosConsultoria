import type { HandlerContext, Partner } from "../types.ts";
import type { StudentAccessPatch } from "../student-access.ts";
import { isUuid } from "../permissions.ts";

export const STUDENT_INVITE_CAS_RPC =
  "portal_atualizar_acesso_aluno_por_gestor_cas";

const SNAPSHOT_FIELDS = [
  "tipo",
  "status",
  "email",
  "cpf_cnpj",
  "polo_id",
  "polo_ids",
  "auth_user_id",
  "auth_login_email",
  "acesso_status",
  "troca_senha_obrigatoria",
  "senha_atualizada_em",
  "senha_temporaria_pendente",
  "senha_temporaria_emitida_em",
  "senha_temporaria_emissao_id",
  "senha_temporaria_emissao_iniciada_em",
  "senha_temporaria_emissao_senha_alterada_em",
  "acesso_ativado_em",
  "convite_enviado_em",
  "aceitou_termos_uso",
  "termos_uso_versao",
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
export const createStudentInviteState = (
  context: HandlerContext,
  partner: Partner,
) => {
  const snapshot: Partner = { ...partner };
  let conflicted = false;
  let forbidden = false;
  let inviteSent = false;
  let recoveryEmailSent = false;

  const write: StudentInviteWriter = async (patch) => {
    if (conflicted || forbidden) {
      return {
        error: forbidden
          ? "Sua permissão para gerenciar este aluno mudou. Atualize os dados."
          : CONFLICT_MESSAGE,
        status: forbidden ? 403 : 409,
        alreadyLinked: false,
      };
    }
    try {
      if (!isUuid(context.gestor?.auth_user_id)) {
        forbidden = true;
        return {
          error: "A identidade do gestor não foi comprovada.",
          status: 403,
          alreadyLinked: false,
        };
      }
      const { data, error } = await context.admin.rpc(STUDENT_INVITE_CAS_RPC, {
        p_actor_auth_user_id: context.gestor.auth_user_id,
        p_partner_id: snapshot.id,
        p_expected_snapshot: Object.fromEntries(
          SNAPSHOT_FIELDS.map((field) => [field, snapshot[field] ?? null]),
        ),
        p_patch: patch,
      });
      if (error) {
        conflicted = CONFLICT_CODES.has(String(error.code));
        forbidden = String(error.code) === "42501";
        return {
          error: forbidden
            ? "Sua permissão para gerenciar este aluno mudou. Atualize os dados."
            : conflicted
            ? CONFLICT_MESSAGE
            : "Falha na atualização autorizada do acesso.",
          status: forbidden ? 403 : conflicted ? 409 : 500,
          alreadyLinked: false,
        };
      }
      if (
        !data || typeof data !== "object" || Array.isArray(data) ||
        data.id !== snapshot.id
      ) {
        return {
          error: "O estado autorizado do aluno não foi retornado.",
          status: 500,
          alreadyLinked: false,
        };
      }
      // Inclui o estado produzido pelos triggers, não só o patch solicitado.
      Object.assign(snapshot, data);
      return { error: null, status: 200, alreadyLinked: false };
    } catch {
      return {
        error: "Falha na atualização autorizada do acesso.",
        status: 500,
        alreadyLinked: false,
      };
    }
  };

  return {
    write,
    check: () => write({}),
    markInviteSent: () => {
      inviteSent = true;
    },
    markRecoveryEmailSent: () => {
      recoveryEmailSent = true;
    },
    delivery: () => ({ inviteSent, recoveryEmailSent, recoveryLink: null }),
    hasFailure: () => conflicted || forbidden,
    failureResponse: (context: HandlerContext) =>
      context.json({
        success: false,
        code: forbidden
          ? "GESTOR_ACESSO_REVOGADO_DURANTE_ENVIO"
          : "ALUNO_ACESSO_ALTERADO_DURANTE_ENVIO",
        inviteSent,
        recoveryEmailSent,
        recoveryLink: null,
        error: (forbidden
          ? "Sua permissão para gerenciar este aluno mudou. Atualize os dados."
          : CONFLICT_MESSAGE) + (inviteSent || recoveryEmailSent
            ? " O e-mail já foi enviado; seu envio não foi cancelado."
            : ""),
      }, forbidden ? 403 : 409),
  };
};

export type StudentInviteState = ReturnType<typeof createStudentInviteState>;
