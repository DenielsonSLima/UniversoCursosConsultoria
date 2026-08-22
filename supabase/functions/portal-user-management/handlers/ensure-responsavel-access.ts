import { findAuthUserByEmail, normalizeEmail } from "../auth-users.ts";
import { isUuid } from "../permissions.ts";
import { resolveRedirectTarget } from "../redirects.ts";
import type { HandlerContext } from "../types.ts";
import {
  loadPreparedResponsavelAccess,
  respondResponsavelAccessFailure,
} from "./responsavel-access-context.ts";

const ACTION = "ensure-responsavel-access";
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const INVITE_OPERATION_NONCE_KEY = "invite_operation_nonce";
const INVITE_OPERATION_ACTOR_KEY = "invite_operation_actor";
const INVITE_OPERATION_PROOF_KEY = "invite_operation_proof";
const INVITE_OPERATION_VERSION_KEY = "invite_operation_version";
const INVITE_OPERATION_VERSION = "v1";
export const INVITE_RECONCILIATION_PROOF_RPC =
  "portal_identidade_assinar_convite_responsavel";
const ACCESS_BLOCK_MESSAGES: Readonly<Record<string, string>> = {
  STATUS_NAO_ATIVO: "Ative o cadastro do responsável antes de criar o acesso.",
  CPF_OBRIGATORIO:
    "Informe e verifique o CPF do responsável antes de criar o acesso.",
  EMAIL_OBRIGATORIO:
    "Informe e verifique o e-mail do responsável antes de criar o acesso.",
  IDENTIDADE_NAO_VERIFICADA:
    "Verifique a identidade do responsável antes de criar o acesso.",
  VINCULO_VERIFICADO_VIGENTE_OBRIGATORIO:
    "Confirme ao menos um vínculo vigente antes de criar o acesso.",
};

type AuthUserRecord = {
  id?: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type InviteResult = {
  data?: { user?: AuthUserRecord | null } | null;
  error?: { message?: string } | null;
};

const onlyDigits = (value: unknown) => String(value || "").replace(/\D/g, "");

const accessResult = (
  context: HandlerContext,
  fields: Record<string, unknown>,
) => context.json({ success: true, action: ACTION, ...fields });

const publicError = (
  context: HandlerContext,
  status: number,
  code: string,
  message: string,
) => {
  const payload = { success: false, code, error: message };
  return context.json(payload, status);
};

const profileMatchesResponsavel = (
  profile: Record<string, unknown>,
  cpf: string,
  email: string,
) => {
  const profileCpf = onlyDigits(profile.cpf_cnpj ?? profile.cpf);
  const canonicalProfileEmail =
    normalizeEmail(profile.auth_login_email as string | null) ||
    normalizeEmail(profile.email as string | null);
  return profileCpf === cpf && canonicalProfileEmail === email;
};

/**
 * Uma identidade Auth preexistente só pode ganhar o segundo perfil quando um
 * cadastro já vinculado ao mesmo UID comprova CPF e e-mail. E-mail sozinho
 * nunca é tratado como prova de que Aluno/Professor/Gestor e Responsável são a
 * mesma pessoa.
 */
const hasSafeMultiProfileOwnership = async (
  context: HandlerContext,
  authUserId: string,
  cpf: string,
  email: string,
) => {
  const { data: partners, error: partnersError } = await context.admin
    .from("parceiros")
    .select("id, cpf_cnpj, email, auth_login_email")
    .eq("auth_user_id", authUserId)
    .limit(10);
  if (partnersError) {
    return { matches: false, lookupFailed: true };
  }
  if (
    (partners || []).some((profile: Record<string, unknown>) =>
      profileMatchesResponsavel(profile, cpf, email)
    )
  ) {
    return { matches: true, lookupFailed: false };
  }

  const { data: gestores, error: gestoresError } = await context.admin
    .from("usuarios_sistema")
    .select("id, cpf, email")
    .eq("auth_user_id", authUserId)
    .limit(10);
  if (gestoresError) {
    return { matches: false, lookupFailed: true };
  }

  return {
    matches: (gestores || []).some((profile: Record<string, unknown>) =>
      profileMatchesResponsavel(profile, cpf, email)
    ),
    lookupFailed: false,
  };
};

const requestInviteOperationProof = async (
  context: HandlerContext,
  originalActorAuthUserId: string,
  requestId: string,
  responsavelLegalId: string,
  email: string,
) => {
  const currentActorAuthUserId = String(
    context.gestor?.auth_user_id || "",
  ).trim();
  if (
    !isUuid(currentActorAuthUserId) || !isUuid(originalActorAuthUserId) ||
    !isUuid(requestId) || !isUuid(responsavelLegalId)
  ) {
    throw new Error("CONTRATO_RECONCILIACAO_CONVITE_INVALIDO");
  }

  const { data, error } = await context.admin.rpc(
    INVITE_RECONCILIATION_PROOF_RPC,
    {
      p_current_actor_auth_user_id: currentActorAuthUserId,
      p_original_actor_auth_user_id: originalActorAuthUserId,
      p_request_id: requestId,
      p_responsavel_legal_id: responsavelLegalId,
      p_email: normalizeEmail(email),
    },
  );
  if (error || typeof data !== "string") {
    throw new Error("RECONCILIACAO_CONVITE_INDISPONIVEL");
  }
  const proof = data.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(proof)) {
    throw new Error("PROVA_RECONCILIACAO_CONVITE_INVALIDA");
  }
  return proof;
};

const constantTimeEqual = (left: string, right: string) => {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^
      (right.charCodeAt(index) || 0);
  }
  return difference === 0;
};

/**
 * user_metadata pode ser alterado pelo próprio usuário. Por isso o marcador
 * só é aceito quando a HMAC emitida pelo servidor comprova ator e nonce
 * originais, o responsável e o e-mail. Ator/nonce atuais podem mudar após um
 * reload; a autorização atual é refeita pela RPC e o requestId atual segue
 * para o bind idempotente. Nenhum campo isolado autoriza o vínculo.
 */
const hasValidInviteOperationMarker = async (
  context: HandlerContext,
  authUser: AuthUserRecord,
  responsavelLegalId: string,
  email: string,
) => {
  const metadata = authUser.user_metadata || {};
  const originalActorAuthUserId = String(
    metadata[INVITE_OPERATION_ACTOR_KEY] || "",
  );
  const originalRequestId = String(
    metadata[INVITE_OPERATION_NONCE_KEY] || "",
  );
  if (
    String(metadata[INVITE_OPERATION_VERSION_KEY] || "") !==
      INVITE_OPERATION_VERSION ||
    !isUuid(originalActorAuthUserId) ||
    !isUuid(originalRequestId) ||
    metadata.origem !== "cadastro_responsavel_legal" ||
    String(metadata.responsavel_legal_id || "") !== responsavelLegalId ||
    normalizeEmail(authUser.email) !== normalizeEmail(email)
  ) {
    return false;
  }

  const receivedProof = String(
    metadata[INVITE_OPERATION_PROOF_KEY] || "",
  ).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(receivedProof)) return false;
  const expectedProof = await requestInviteOperationProof(
    context,
    originalActorAuthUserId,
    originalRequestId,
    responsavelLegalId,
    email,
  );
  return constantTimeEqual(receivedProof, expectedProof);
};

const bindResponsavelAccess = async (
  context: HandlerContext,
  responsavelLegalId: string,
  authUserId: string,
  requestId: string,
) => {
  const actorAuthUserId = String(context.gestor?.auth_user_id || "").trim();
  const { data, error } = await context.admin.rpc(
    "responsavel_legal_acesso_vincular",
    {
      p_responsavel_legal_id: responsavelLegalId,
      p_auth_user_id: authUserId,
      p_actor_auth_user_id: actorAuthUserId,
      p_request_id: requestId,
    },
  );
  return { data, error };
};

export const handleEnsureResponsavelAccess = async (
  context: HandlerContext,
  responsavelLegalIdValue: unknown,
  requestIdValue?: unknown,
) => {
  const responsavelLegalId = String(responsavelLegalIdValue || "").trim();
  if (!isUuid(responsavelLegalId)) {
    return publicError(
      context,
      400,
      "RESPONSAVEL_LEGAL_ID_INVALIDO",
      "responsavelLegalId válido é obrigatório.",
    );
  }

  const requestId = String(requestIdValue || "").trim();
  if (!isUuid(requestId)) {
    return publicError(
      context,
      400,
      "REQUEST_ID_INVALIDO",
      "requestId UUID estável é obrigatório.",
    );
  }

  const prepared = await loadPreparedResponsavelAccess(
    context,
    responsavelLegalId,
  );
  if ("failure" in prepared) {
    return respondResponsavelAccessFailure(context, prepared);
  }
  const actorAuthUserId = String(context.gestor?.auth_user_id || "").trim();
  if (!prepared.eligible || !prepared.cpf || !prepared.email) {
    return accessResult(context, {
      userId: prepared.authUserId,
      inviteSent: false,
      profileLinked: Boolean(prepared.authUserId),
      profileLinkState: "not_eligible",
      message: ACCESS_BLOCK_MESSAGES[prepared.accessBlockReason || ""] ||
        "Complete e verifique a identidade e o vínculo do responsável antes de criar o acesso.",
    });
  }
  if (!EMAIL_PATTERN.test(prepared.email)) {
    return publicError(
      context,
      400,
      "RESPONSAVEL_EMAIL_INVALIDO",
      "O e-mail verificado do responsável é inválido.",
    );
  }

  if (prepared.authUserId) {
    const { data, error } = await context.admin.auth.admin.getUserById(
      prepared.authUserId,
    );
    const authUser = data?.user;
    if (error || !authUser?.id) {
      return publicError(
        context,
        409,
        "RESPONSAVEL_AUTH_INCONSISTENTE",
        "O vínculo de autenticação do responsável está inconsistente e requer revisão.",
      );
    }
    if (normalizeEmail(authUser.email) !== prepared.email) {
      return publicError(
        context,
        409,
        "RESPONSAVEL_AUTH_EMAIL_DIVERGENTE",
        "O e-mail do acesso não corresponde ao e-mail verificado do responsável.",
      );
    }
    return accessResult(context, {
      userId: authUser.id,
      inviteSent: false,
      profileLinked: true,
      profileLinkState: "already_linked",
    });
  }

  let authUser: AuthUserRecord | null;
  try {
    authUser = await findAuthUserByEmail(context.admin, prepared.email);
  } catch {
    return publicError(
      context,
      500,
      "RESPONSAVEL_AUTH_CONSULTA_FALHOU",
      "Não foi possível verificar a identidade de acesso existente.",
    );
  }

  let inviteSent = false;
  if (authUser?.id) {
    let isReconciledInvite: boolean;
    try {
      isReconciledInvite = await hasValidInviteOperationMarker(
        context,
        authUser,
        responsavelLegalId,
        prepared.email,
      );
    } catch {
      return publicError(
        context,
        500,
        "RESPONSAVEL_CONVITE_CONFIGURACAO_AUSENTE",
        "A configuração segura de reconciliação do convite está indisponível.",
      );
    }

    if (!isReconciledInvite) {
      const ownership = await hasSafeMultiProfileOwnership(
        context,
        authUser.id,
        prepared.cpf,
        prepared.email,
      );
      if (ownership.lookupFailed) {
        return publicError(
          context,
          500,
          "RESPONSAVEL_IDENTIDADE_CONSULTA_FALHOU",
          "Não foi possível conferir a titularidade da identidade existente.",
        );
      }
      if (!ownership.matches) {
        return publicError(
          context,
          409,
          "RESPONSAVEL_IDENTIDADE_DIVERGENTE",
          "Já existe uma conta para este e-mail, mas CPF e cadastro vinculado ou o marcador seguro da operação não comprovam que pertence ao mesmo responsável.",
        );
      }
    }
  } else {
    const redirectResolution = resolveRedirectTarget("/recuperar-senha");
    if (!redirectResolution.redirectTo) {
      return publicError(
        context,
        redirectResolution.status,
        "RESPONSAVEL_REDIRECIONAMENTO_INDISPONIVEL",
        "Não foi possível preparar o link de primeiro acesso.",
      );
    }

    let invitationProof: string;
    try {
      invitationProof = await requestInviteOperationProof(
        context,
        actorAuthUserId,
        requestId,
        responsavelLegalId,
        prepared.email,
      );
    } catch {
      return publicError(
        context,
        500,
        "RESPONSAVEL_CONVITE_CONFIGURACAO_AUSENTE",
        "A configuração segura de reconciliação do convite está indisponível.",
      );
    }

    let inviteResult: InviteResult | undefined;
    let inviteFailure: unknown = null;
    try {
      inviteResult = await context.admin.auth.admin.inviteUserByEmail(
        prepared.email,
        {
          data: {
            nome: prepared.nome,
            origem: "cadastro_responsavel_legal",
            tipo: "ResponsavelLegal",
            responsavel_legal_id: responsavelLegalId,
            [INVITE_OPERATION_VERSION_KEY]: INVITE_OPERATION_VERSION,
            [INVITE_OPERATION_ACTOR_KEY]: actorAuthUserId,
            [INVITE_OPERATION_NONCE_KEY]: requestId,
            [INVITE_OPERATION_PROOF_KEY]: invitationProof,
          },
          redirectTo: redirectResolution.redirectTo,
        },
      );
    } catch (error) {
      inviteFailure = error;
    }

    authUser = !inviteResult?.error && inviteResult?.data?.user
      ? inviteResult.data.user
      : null;
    if (!authUser?.id) {
      try {
        const possibleReconciliation = await findAuthUserByEmail(
          context.admin,
          prepared.email,
        );
        if (
          possibleReconciliation?.id &&
          await hasValidInviteOperationMarker(
            context,
            possibleReconciliation,
            responsavelLegalId,
            prepared.email,
          )
        ) {
          authUser = possibleReconciliation;
        }
      } catch {
        // A falha original é devolvida abaixo sem aceitar identidade não provada.
      }
    }
    if (!authUser?.id) {
      return publicError(
        context,
        500,
        "RESPONSAVEL_CONVITE_FALHOU",
        "Não foi possível confirmar a criação do convite do responsável.",
      );
    }
    let inviteMarkerIsValid: boolean;
    try {
      inviteMarkerIsValid = await hasValidInviteOperationMarker(
        context,
        authUser,
        responsavelLegalId,
        prepared.email,
      );
    } catch {
      return publicError(
        context,
        500,
        "RESPONSAVEL_CONVITE_CONFIGURACAO_AUSENTE",
        "A configuração segura de reconciliação do convite está indisponível.",
      );
    }
    if (!inviteMarkerIsValid) {
      return publicError(
        context,
        409,
        "RESPONSAVEL_CONVITE_PROVA_INVALIDA",
        "Não foi possível comprovar que o convite criou uma nova identidade para este responsável. A identidade foi preservada para reconciliação segura.",
      );
    }
    inviteSent = Boolean(!inviteFailure && !inviteResult?.error);
  }

  const binding = await bindResponsavelAccess(
    context,
    responsavelLegalId,
    authUser.id,
    requestId,
  );
  if (binding.error) {
    const status =
      binding.error.code === "23505" || binding.error.code === "40001"
        ? 409
        : binding.error.code === "42501"
        ? 403
        : 500;
    const code = status === 409
      ? "RESPONSAVEL_ACESSO_CONFLITO"
      : status === 403
      ? "RESPONSAVEL_ACESSO_NAO_AUTORIZADO"
      : "RESPONSAVEL_ACESSO_VINCULO_FALHOU";
    return publicError(
      context,
      status,
      code,
      `Não foi possível vincular o acesso do responsável.${
        inviteSent
          ? " A identidade convidada foi preservada para reconciliação segura."
          : ""
      }`,
    );
  }

  return accessResult(context, {
    userId: authUser.id,
    inviteSent,
    profileLinked: true,
    profileLinkState: "linked",
    message: inviteSent
      ? "Convite de primeiro acesso enviado ao responsável."
      : "O perfil de Responsável foi adicionado à identidade existente.",
  });
};
