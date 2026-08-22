import { normalizeEmail } from "../auth-users.ts";
import { findAuthIdentityConflict } from "../auth-identity-ownership.ts";
import type { HandlerContext, Partner } from "../types.ts";

type CanonicalStudentIdentity = {
  authUser: any;
  email: string;
};

type CanonicalStudentIdentityFailure = {
  error: string;
  status: number;
};

export const resolveCanonicalStudentIdentity = async (
  context: HandlerContext,
  partner: Partner,
): Promise<CanonicalStudentIdentity | CanonicalStudentIdentityFailure> => {
  if (partner.tipo !== "Aluno") {
    return {
      error: "Esta ação está disponível somente para alunos.",
      status: 400,
    };
  }

  const contactEmail = normalizeEmail(partner.email);
  const authEmail = normalizeEmail(partner.auth_login_email || partner.email);
  if (!contactEmail || !authEmail || contactEmail !== authEmail) {
    return {
      error:
        "O e-mail cadastral precisa coincidir com a identidade de acesso do aluno.",
      status: 409,
    };
  }

  if (authEmail.endsWith("@acesso.universocc.invalid")) {
    return {
      error:
        "Este aluno usa acesso por matrícula e não possui uma caixa postal para validar.",
      status: 400,
    };
  }

  if (!partner.auth_user_id) {
    return {
      error:
        "O usuário de acesso ainda não foi criado. Reenvie o primeiro acesso antes de continuar.",
      status: 409,
    };
  }

  let authUser: any;
  try {
    const response = await context.admin.auth.admin.getUserById(
      partner.auth_user_id,
    );
    if (response.error || !response.data?.user) {
      return {
        error:
          "O vínculo de autenticação deste aluno está inconsistente e requer revisão.",
        status: 409,
      };
    }
    authUser = response.data.user;
  } catch {
    return {
      error: "Não foi possível validar a identidade de acesso do aluno.",
      status: 500,
    };
  }

  if (normalizeEmail(authUser.email) !== authEmail) {
    return {
      error:
        "O e-mail de acesso não corresponde à identidade vinculada ao aluno.",
      status: 409,
    };
  }

  const metadataPartnerId = String(
    authUser.user_metadata?.partner_id || "",
  ).trim();
  if (metadataPartnerId && metadataPartnerId !== partner.id) {
    return {
      error: "Esta identidade de acesso já está vinculada a outro cadastro.",
      status: 409,
    };
  }

  const identityConflict = await findAuthIdentityConflict(
    context.admin,
    partner.id,
    authUser.id,
  );
  if (identityConflict.error) {
    return { error: identityConflict.error, status: 500 };
  }
  if (identityConflict.conflict) {
    return { error: identityConflict.conflict, status: 409 };
  }

  return { authUser, email: authEmail };
};
