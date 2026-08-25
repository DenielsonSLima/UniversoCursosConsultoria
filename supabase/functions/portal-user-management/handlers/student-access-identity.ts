import { normalizeEmail } from "../auth-users.ts";
import { findAuthIdentityConflict } from "../auth-identity-ownership.ts";
import type { StudentAccessPatch } from "../student-access.ts";
import type { HandlerContext, Partner } from "../types.ts";

type CanonicalStudentIdentity = {
  authUser: any;
  email: string;
};

type CanonicalStudentIdentityFailure = {
  error: string;
  status: number;
};

export const authOwnershipError = (
  partner: Partner,
  authUser: any,
  expectedEmail: string,
) => {
  if (!authUser?.id) return "Usuário de autenticação inválido.";
  if (partner.auth_user_id && partner.auth_user_id !== authUser.id) {
    return "Este aluno já está vinculado a outra identidade de acesso.";
  }
  if (normalizeEmail(authUser.email) !== expectedEmail) {
    return "O e-mail de acesso não corresponde à identidade localizada.";
  }
  return null;
};

type StudentIdentityBindingResult = {
  error: string | null;
  status: number;
  alreadyLinked: boolean;
};

type SharedStudentIdentityBindingResult = StudentIdentityBindingResult & {
  credentialReady: boolean;
};

const STUDENT_BINDING_ERROR =
  "Não foi possível vincular a identidade de acesso do aluno.";
const STUDENT_BINDING_CONFLICT_CODES = new Set([
  "23505",
  "23514",
  "40001",
  "40P01",
]);
export const SHARED_CREDENTIAL_READY_RPC =
  "portal_identidade_credencial_compartilhada_liberada";

const readSharedCredentialReadiness = async (
  admin: any,
  authUserId: string,
  partnerId: string,
) => {
  try {
    const { data, error } = await admin.rpc(SHARED_CREDENTIAL_READY_RPC, {
      p_auth_user_id: authUserId,
      p_exclude_partner_id: partnerId,
      p_exclude_responsavel_id: null,
    });
    if (error || typeof data !== "boolean") {
      return {
        ready: false,
        error:
          "Não foi possível confirmar se o primeiro acesso da identidade existente foi concluído.",
      };
    }
    return { ready: data, error: null };
  } catch {
    return {
      ready: false,
      error:
        "Não foi possível confirmar se o primeiro acesso da identidade existente foi concluído.",
    };
  }
};

const bindStudentIdentityIfUnchanged = async (
  admin: any,
  partner: Partner,
  authUserId: string,
  authEmail: string,
  patch: StudentAccessPatch,
): Promise<StudentIdentityBindingResult> => {
  let query = admin
    .from("parceiros")
    .update(patch)
    .eq("id", partner.id)
    .eq("tipo", "Aluno");
  query = partner.cpf_cnpj
    ? query.eq("cpf_cnpj", partner.cpf_cnpj)
    : query.is("cpf_cnpj", null);
  query = partner.email
    ? query.eq("email", partner.email)
    : query.is("email", null);
  query = partner.auth_user_id
    ? query.eq("auth_user_id", partner.auth_user_id)
    : query.is("auth_user_id", null);
  query = partner.auth_login_email
    ? query.eq("auth_login_email", partner.auth_login_email)
    : query.is("auth_login_email", null);
  if (partner.status !== undefined) {
    query = partner.status
      ? query.eq("status", partner.status)
      : query.is("status", null);
  }

  try {
    const { data, error } = await query
      .select("id, auth_user_id")
      .maybeSingle();
    if (error) {
      const isConflict = STUDENT_BINDING_CONFLICT_CODES.has(error.code);
      return {
        error: isConflict
          ? "A identidade ou o primeiro acesso mudou durante o vínculo. Tente novamente."
          : STUDENT_BINDING_ERROR,
        status: isConflict ? 409 : 500,
        alreadyLinked: false,
      };
    }
    if (data) {
      return { error: null, status: 200, alreadyLinked: false };
    }

    const { data: current, error: currentError } = await admin
      .from("parceiros")
      .select("id, email, auth_user_id, auth_login_email")
      .eq("id", partner.id)
      .maybeSingle();
    if (currentError) {
      return {
        error: STUDENT_BINDING_ERROR,
        status: 500,
        alreadyLinked: false,
      };
    }
    if (
      current?.auth_user_id === authUserId &&
      normalizeEmail(current.auth_login_email || current.email) === authEmail
    ) {
      return { error: null, status: 200, alreadyLinked: true };
    }
    return {
      error:
        "O cadastro do aluno mudou durante o vínculo. Atualize os dados e tente novamente.",
      status: 409,
      alreadyLinked: false,
    };
  } catch {
    return {
      error: STUDENT_BINDING_ERROR,
      status: 500,
      alreadyLinked: false,
    };
  }
};

export const bindSharedStudentIdentity = async (
  admin: any,
  partner: Partner,
  authUserId: string,
  authEmail: string,
  accessWasActive: boolean,
): Promise<SharedStudentIdentityBindingResult> => {
  const targetHasTemporaryFence = Boolean(
    partner.senha_temporaria_pendente ||
      partner.senha_temporaria_emissao_id ||
      partner.senha_temporaria_emissao_iniciada_em ||
      partner.senha_temporaria_emissao_senha_alterada_em,
  );
  if (
    accessWasActive && partner.senha_atualizada_em &&
    !targetHasTemporaryFence
  ) {
    const binding = await bindStudentIdentityIfUnchanged(
      admin,
      partner,
      authUserId,
      authEmail,
      {
        auth_user_id: authUserId,
        auth_login_email: authEmail,
        acesso_erro: null,
      },
    );
    return { ...binding, credentialReady: true };
  }

  const credential = await readSharedCredentialReadiness(
    admin,
    authUserId,
    partner.id,
  );
  if (credential.error) {
    return {
      error: credential.error,
      status: 500,
      alreadyLinked: false,
      credentialReady: false,
    };
  }

  if (credential.ready && targetHasTemporaryFence) {
    return {
      error:
        "O primeiro acesso temporário deste aluno ainda está em andamento. Conclua ou cancele essa emissão antes de reutilizar a identidade.",
      status: 409,
      alreadyLinked: false,
      credentialReady: false,
    };
  }

  const credentialPropagatedAt = new Date().toISOString();
  const binding = await bindStudentIdentityIfUnchanged(
    admin,
    partner,
    authUserId,
    authEmail,
    credential.ready
      ? {
        auth_user_id: authUserId,
        auth_login_email: authEmail,
        senha_atualizada_em: partner.senha_atualizada_em ||
          credentialPropagatedAt,
        troca_senha_obrigatoria: false,
        acesso_status: "ativo",
        acesso_erro: null,
        acesso_ativado_em: partner.acesso_ativado_em ||
          credentialPropagatedAt,
      }
      : {
        auth_user_id: authUserId,
        auth_login_email: authEmail,
        troca_senha_obrigatoria: true,
        acesso_status: "pendente",
        acesso_erro: null,
        acesso_ativado_em: null,
      },
  );
  return { ...binding, credentialReady: credential.ready };
};

export const bindCreatedStudentIdentity = (
  admin: any,
  partner: Partner,
  authUserId: string,
  authEmail: string,
  invitationExists: boolean,
) =>
  bindStudentIdentityIfUnchanged(admin, partner, authUserId, authEmail, {
    auth_user_id: authUserId,
    auth_login_email: authEmail,
    troca_senha_obrigatoria: true,
    acesso_status: invitationExists ? "convite_enviado" : "processando",
    acesso_erro: null,
    ...(invitationExists
      ? {
        convite_enviado_em: partner.convite_enviado_em ||
          new Date().toISOString(),
      }
      : {}),
    acesso_ativado_em: null,
  });

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

  const identityConflict = await findAuthIdentityConflict(
    context.admin,
    partner,
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
