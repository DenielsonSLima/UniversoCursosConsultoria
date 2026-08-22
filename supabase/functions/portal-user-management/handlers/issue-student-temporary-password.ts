import type { HandlerContext, Partner } from "../types.ts";
import { isUuid } from "../permissions.ts";
import { recordStudentAccessAudit } from "./student-access-audit.ts";
import {
  getCurrentTermsVersion,
  hasCompletedStudentFirstAccess,
} from "./student-first-access-state.ts";
import { resolveCanonicalStudentIdentity } from "./student-access-identity.ts";

const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%*-_";
const ALL_PASSWORD_CHARACTERS = UPPERCASE + LOWERCASE + DIGITS + SYMBOLS;
const TEMPORARY_PASSWORD_ISSUE_METADATA_KEY =
  "universocc_temporary_password_issue_id";

const secureRandomIndex = (length: number) => {
  const limit = Math.floor(4_294_967_296 / length) * length;
  const value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return value[0] % length;
};

const pick = (characters: string) =>
  characters[secureRandomIndex(characters.length)];

const shuffle = (characters: string[]) => {
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = secureRandomIndex(index + 1);
    [characters[index], characters[swapIndex]] = [
      characters[swapIndex],
      characters[index],
    ];
  }
  return characters;
};

/** Mantém a política do primeiro acesso sem guardar a senha em lugar algum. */
export const generateStudentTemporaryPassword = () => {
  const characters = [
    pick(UPPERCASE),
    pick(LOWERCASE),
    pick(DIGITS),
    pick(SYMBOLS),
  ];
  while (characters.length < 16) characters.push(pick(ALL_PASSWORD_CHARACTERS));
  return shuffle(characters).join("");
};

const reserveTemporaryPasswordEmission = async (
  context: HandlerContext,
  partnerId: string,
  issueId: string,
  actorAuthUserId: string,
) => {
  try {
    const { data, error } = await context.admin.rpc(
      "portal_reservar_emissao_senha_temporaria",
      {
        p_partner_id: partnerId,
        p_emissao_id: issueId,
        p_actor_auth_user_id: actorAuthUserId,
      },
    );
    if (error) {
      return { error: error.message || "Não foi possível reservar a emissão." };
    }
    return { reserved: data === true };
  } catch {
    return { error: "Não foi possível reservar a emissão." };
  }
};

const completeTemporaryPasswordEmission = async (
  context: HandlerContext,
  partnerId: string,
  issueId: string,
  actorAuthUserId: string,
) => {
  try {
    const { data, error } = await context.admin.rpc(
      "portal_concluir_emissao_senha_temporaria",
      {
        p_partner_id: partnerId,
        p_emissao_id: issueId,
        p_actor_auth_user_id: actorAuthUserId,
      },
    );
    if (error) {
      return {
        error: error.message ||
          "Não foi possível concluir o registro da senha temporária.",
      };
    }
    if (data !== true) return { completed: false };
    return { completed: true };
  } catch {
    return {
      error: "Não foi possível concluir o registro da senha temporária.",
    };
  }
};

const cancelTemporaryPasswordEmission = async (
  context: HandlerContext,
  partnerId: string,
  issueId: string,
  actorAuthUserId: string,
) => {
  try {
    const { data, error } = await context.admin.rpc(
      "portal_cancelar_emissao_senha_temporaria",
      {
        p_partner_id: partnerId,
        p_emissao_id: issueId,
        p_actor_auth_user_id: actorAuthUserId,
      },
    );
    if (error) {
      return {
        error: error.message ||
          "Não foi possível liberar a emissão não concluída.",
      };
    }
    return { cancelled: data === true };
  } catch {
    return { error: "Não foi possível liberar a emissão não concluída." };
  }
};

const confirmTemporaryPasswordEmissionCleanup = async (
  context: HandlerContext,
  partnerId: string,
  issueId: string,
  actorAuthUserId: string,
) => {
  try {
    const { data, error } = await context.admin.rpc(
      "portal_confirmar_limpeza_emissao_senha_temporaria",
      {
        p_partner_id: partnerId,
        p_emissao_id: issueId,
        p_actor_auth_user_id: actorAuthUserId,
      },
    );
    if (error) {
      return {
        error: error.message ||
          "Não foi possível concluir a limpeza da emissão.",
      };
    }
    return { cleaned: data === true };
  } catch {
    return { error: "Não foi possível concluir a limpeza da emissão." };
  }
};

const appMetadataForTemporaryPasswordIssue = (
  authUser: any,
  issueId: string,
) => ({
  ...(authUser?.app_metadata && typeof authUser.app_metadata === "object" &&
      !Array.isArray(authUser.app_metadata)
    ? authUser.app_metadata
    : {}),
  [TEMPORARY_PASSWORD_ISSUE_METADATA_KEY]: issueId,
});

const temporaryPasswordIssueIdFromAuthUser = (authUser: any) =>
  String(
    authUser?.app_metadata?.[TEMPORARY_PASSWORD_ISSUE_METADATA_KEY] || "",
  ).trim();

const appMetadataWithoutTemporaryPasswordIssue = (authUser: any) => {
  const appMetadata = authUser?.app_metadata &&
      typeof authUser.app_metadata === "object" &&
      !Array.isArray(authUser.app_metadata)
    ? authUser.app_metadata
    : {};
  // GoTrue mescla app_metadata. Para remover de fato a chave, ela precisa ser
  // enviada com null; omiti-la preservaria o UUID da emissão anterior.
  return {
    ...appMetadata,
    [TEMPORARY_PASSWORD_ISSUE_METADATA_KEY]: null,
  };
};

const markTemporaryPasswordIssueInAuth = async (
  context: HandlerContext,
  authUserId: string,
  issueId: string,
) => {
  let authUser: any;
  try {
    const { data, error } = await context.admin.auth.admin.getUserById(
      authUserId,
    );
    if (error || !data?.user) {
      return {
        error:
          "Não foi possível preparar a identidade para a emissão da senha temporária.",
      };
    }
    authUser = data.user;
  } catch {
    return {
      error:
        "Não foi possível preparar a identidade para a emissão da senha temporária.",
    };
  }

  const currentIssueId = temporaryPasswordIssueIdFromAuthUser(authUser);
  if (currentIssueId && currentIssueId !== issueId) {
    return {
      error:
        "Existe um marcador técnico de outra emissão que precisa ser revisado antes de gerar uma senha.",
    };
  }

  let markerUpdateFailed = false;
  if (currentIssueId !== issueId) {
    try {
      // O GoTrue atualiza a senha antes do app_metadata quando ambos chegam
      // juntos. Gravamos o marcador em uma etapa própria para que o trigger
      // do banco consiga cercar a troca de senha seguinte.
      const { error: updateError } = await context.admin.auth.admin
        .updateUserById(authUserId, {
          app_metadata: appMetadataForTemporaryPasswordIssue(authUser, issueId),
        });
      markerUpdateFailed = Boolean(updateError);
    } catch {
      markerUpdateFailed = true;
      // A resposta pode se perder depois do commit. A leitura abaixo é a
      // fonte canônica para decidir se a etapa ficou pronta.
    }
  }

  try {
    const { data, error } = await context.admin.auth.admin.getUserById(
      authUserId,
    );
    if (
      !error && data?.user &&
      temporaryPasswordIssueIdFromAuthUser(data.user) === issueId
    ) {
      return { marked: true };
    }
  } catch {
    // Falha fechada abaixo: não trocamos senha sem confirmar o marcador.
  }

  return {
    error: markerUpdateFailed
      ? "O Auth não confirmou o marcador seguro da emissão da senha temporária."
      : "Não foi possível confirmar o marcador seguro da emissão da senha temporária.",
  };
};

const cleanTemporaryPasswordIssueMarker = async (
  context: HandlerContext,
  partnerId: string,
  issueId: string,
  authUserId: string,
  actorAuthUserId: string,
) => {
  let cleanupUpdateFailed = false;
  try {
    const { data, error } = await context.admin.auth.admin.getUserById(
      authUserId,
    );
    if (error || !data?.user) {
      return {
        error:
          "Não foi possível localizar a identidade para concluir a limpeza da emissão.",
      };
    }

    if (temporaryPasswordIssueIdFromAuthUser(data.user) === issueId) {
      try {
        const { error: updateError } = await context.admin.auth.admin
          .updateUserById(authUserId, {
            app_metadata: appMetadataWithoutTemporaryPasswordIssue(data.user),
          });
        cleanupUpdateFailed = Boolean(updateError);
      } catch {
        cleanupUpdateFailed = true;
        // A confirmação canônica abaixo consulta auth.users novamente e só
        // libera a reserva se o marcador realmente não estiver mais presente.
      }
    }
  } catch {
    return {
      error:
        "Não foi possível localizar a identidade para concluir a limpeza da emissão.",
    };
  }

  const confirmation = await confirmTemporaryPasswordEmissionCleanup(
    context,
    partnerId,
    issueId,
    actorAuthUserId,
  );
  if ("cleaned" in confirmation && confirmation.cleaned) return confirmation;
  if (cleanupUpdateFailed && !("error" in confirmation)) {
    return {
      error: "Não foi possível remover o marcador técnico da emissão.",
    };
  }
  return confirmation;
};

const revokeAndCleanTemporaryPasswordEmission = async (
  context: HandlerContext,
  partnerId: string,
  issueId: string,
  authUserId: string,
  actorAuthUserId: string,
) => {
  const cancellation = await cancelTemporaryPasswordEmission(
    context,
    partnerId,
    issueId,
    actorAuthUserId,
  );
  if (!("cancelled" in cancellation) || !cancellation.cancelled) {
    return { cleaned: false, cancellationFailed: true };
  }

  return cleanTemporaryPasswordIssueMarker(
    context,
    partnerId,
    issueId,
    authUserId,
    actorAuthUserId,
  );
};

const reconcilePendingTemporaryPasswordEmission = async (
  context: HandlerContext,
  partner: Partner,
  authUserId: string,
  actorAuthUserId: string,
) => {
  const pendingIssueId = String(
    partner.senha_temporaria_emissao_id || "",
  ).trim();
  if (!pendingIssueId) return { reconciled: true };
  if (!isUuid(pendingIssueId)) return { reconciled: false };

  const revokedIssueIds = Array.isArray(
      partner.senha_temporaria_emissoes_revogadas,
    )
    ? partner.senha_temporaria_emissoes_revogadas
    : [];
  const cleanupPending = partner.senha_temporaria_emissao_iniciada_em == null &&
    revokedIssueIds.includes(pendingIssueId);

  try {
    await recordStudentAccessAudit(context, partner, {
      action: cleanupPending
        ? "Autorizou limpeza de emissão de senha temporária"
        : "Autorizou reconciliação de senha temporária",
      description: cleanupPending
        ? "Autorizou a remoção segura do marcador técnico de uma emissão revogada, sem revelar credenciais."
        : "Autorizou a conferência de uma emissão pendente de senha temporária sem revelar credenciais.",
      details: {
        delivery: "manager_assisted",
        reconciliation: cleanupPending ? "marker_cleanup" : "pending_issue",
      },
    });
  } catch {
    return { reconciled: false, auditUnavailable: true };
  }

  if (cleanupPending) {
    const cleanup = await cleanTemporaryPasswordIssueMarker(
      context,
      partner.id,
      pendingIssueId,
      authUserId,
      actorAuthUserId,
    );
    return {
      reconciled: "cleaned" in cleanup && cleanup.cleaned === true,
    };
  }

  if (partner.senha_temporaria_emissao_iniciada_em == null) {
    return { reconciled: false };
  }

  const completion = await completeTemporaryPasswordEmission(
    context,
    partner.id,
    pendingIssueId,
    actorAuthUserId,
  );
  if ("error" in completion) {
    return { reconciled: false };
  }
  if (!completion.completed) {
    // Depois que a chamada de senha foi enviada, uma resposta ausente não
    // prova que o Auth não a aplicará mais tarde. Mantemos a reserva e o
    // marcador ativos em vez de liberar uma nova emissão que poderia ser
    // sobrescrita por esse retry tardio.
    return { reconciled: false };
  }

  const cleanup = await cleanTemporaryPasswordIssueMarker(
    context,
    partner.id,
    pendingIssueId,
    authUserId,
    actorAuthUserId,
  );
  return {
    reconciled: "cleaned" in cleanup && cleanup.cleaned === true,
  };
};

const temporaryPasswordSuccessResponse = (
  context: HandlerContext,
  partner: Partner,
  userId: string,
  temporaryPassword: string,
) =>
  context.json({
    success: true,
    action: "issue-student-temporary-password",
    userId,
    emailConfirmed: true,
    emailValidatedByManager: Boolean(partner.email_validado_gestor_em),
    temporaryPassword,
    message:
      "Senha temporária gerada. O aluno deverá criar uma nova senha no primeiro login.",
  });

export const handleIssueStudentTemporaryPassword = async (
  context: HandlerContext,
  partner: Partner,
) => {
  const { admin, json } = context;
  const identity = await resolveCanonicalStudentIdentity(context, partner);
  if ("error" in identity) {
    return json({ success: false, error: identity.error }, identity.status);
  }

  const terms = await getCurrentTermsVersion(context);
  if ("error" in terms) {
    return json({ success: false, error: terms.error }, 500);
  }
  if (hasCompletedStudentFirstAccess(partner, terms.version)) {
    return json({
      success: false,
      error:
        "Este aluno já concluiu o primeiro acesso. Use a recuperação de senha por e-mail quando necessário.",
    }, 409);
  }

  const emailWasConfirmed = Boolean(
    identity.authUser.email_confirmed_at || identity.authUser.confirmed_at,
  );
  if (!emailWasConfirmed && !partner.email_validado_gestor_em) {
    return json({
      success: false,
      error: "Valide o e-mail informado antes de gerar uma senha temporária.",
    }, 409);
  }

  const actorAuthUserId = String(context.gestor?.auth_user_id || "").trim();
  if (!isUuid(actorAuthUserId)) {
    return json({
      success: false,
      error: "A identidade do gestor não pôde ser confirmada.",
    }, 401);
  }

  const reconciliation = await reconcilePendingTemporaryPasswordEmission(
    context,
    partner,
    identity.authUser.id,
    actorAuthUserId,
  );
  if (!reconciliation.reconciled) {
    return json({
      success: false,
      error: reconciliation.auditUnavailable
        ? "Não foi possível auditar a reconciliação de uma emissão pendente. Não gere outra senha até revisar esta emissão."
        : "Existe uma emissão pendente cuja confirmação segura ainda não foi localizada. Não gere outra senha até revisar esta emissão.",
    }, reconciliation.auditUnavailable ? 500 : 409);
  }

  try {
    await recordStudentAccessAudit(context, partner, {
      action: "Autorizou emissão de senha temporária",
      description:
        "Autorizou a emissão de uma senha temporária para o aluno concluir o primeiro acesso.",
      details: { delivery: "manager_assisted", firstAccessRequired: true },
    });
  } catch {
    return json({
      success: false,
      error:
        "Não foi possível registrar a autorização para emitir a senha temporária.",
    }, 500);
  }

  const issueId = crypto.randomUUID();
  const reservation = await reserveTemporaryPasswordEmission(
    context,
    partner.id,
    issueId,
    actorAuthUserId,
  );
  if (reservation.error) {
    return json({ success: false, error: reservation.error }, 500);
  }
  if (!reservation.reserved) {
    return json({
      success: false,
      error:
        "Já existe uma emissão de senha temporária pendente para este aluno. Conclua ou revise a emissão anterior antes de gerar outra.",
    }, 409);
  }

  const marking = await markTemporaryPasswordIssueInAuth(
    context,
    identity.authUser.id,
    issueId,
  );
  if (!("marked" in marking) || !marking.marked) {
    const cancellation = await revokeAndCleanTemporaryPasswordEmission(
      context,
      partner.id,
      issueId,
      identity.authUser.id,
      actorAuthUserId,
    );
    return json({
      success: false,
      error: "cleaned" in cancellation && cancellation.cleaned
        ? marking.error ||
          "Não foi possível preparar a emissão segura da senha temporária. Gere uma nova senha."
        : "Não foi possível preparar a emissão segura da senha temporária. Não gere outra até revisar esta emissão.",
    }, 500);
  }

  const temporaryPassword = generateStudentTemporaryPassword();
  let updateError: any;
  try {
    ({ error: updateError } = await admin.auth.admin.updateUserById(
      identity.authUser.id,
      {
        email_confirm: true,
        password: temporaryPassword,
      },
    ));
  } catch {
    // A ausência de resposta é ambígua: a alteração no Auth pode ter sido
    // concluída. Só liberamos a senha se o banco confirmar o marcador e a
    // troca de credencial desta mesma emissão.
    const completionAfterUnknownUpdate =
      await completeTemporaryPasswordEmission(
        context,
        partner.id,
        issueId,
        actorAuthUserId,
      );
    if (
      "completed" in completionAfterUnknownUpdate &&
      completionAfterUnknownUpdate.completed
    ) {
      const cleanup = await cleanTemporaryPasswordIssueMarker(
        context,
        partner.id,
        issueId,
        identity.authUser.id,
        actorAuthUserId,
      );
      if ("cleaned" in cleanup && cleanup.cleaned) {
        return temporaryPasswordSuccessResponse(
          context,
          partner,
          identity.authUser.id,
          temporaryPassword,
        );
      }
      return json({
        success: false,
        error:
          "A senha foi atualizada, mas a limpeza segura da emissão ficou pendente. Não entregue esta senha; tente gerar uma nova depois.",
      }, 500);
    }
    if ("error" in completionAfterUnknownUpdate) {
      return json({
        success: false,
        error:
          "Não foi possível confirmar o estado da emissão. Não gere outra senha até revisar esta emissão.",
      }, 500);
    }

    return json({
      success: false,
      error:
        "A comunicação com o Auth falhou e a emissão permanece pendente para evitar sobrescrever uma senha. Não gere outra até revisar esta emissão.",
    }, 500);
  }
  if (updateError) {
    // Uma resposta explícita de erro normalmente significa que o Auth rejeitou
    // a alteração. Ainda conferimos a emissão primeiro: se ela chegou a ser
    // persistida apesar da resposta, a conclusão canônica é a única fonte que
    // autoriza a entrega da senha.
    const completionAfterRejectedUpdate =
      await completeTemporaryPasswordEmission(
        context,
        partner.id,
        issueId,
        actorAuthUserId,
      );
    if (
      "completed" in completionAfterRejectedUpdate &&
      completionAfterRejectedUpdate.completed
    ) {
      const cleanup = await cleanTemporaryPasswordIssueMarker(
        context,
        partner.id,
        issueId,
        identity.authUser.id,
        actorAuthUserId,
      );
      if ("cleaned" in cleanup && cleanup.cleaned) {
        return temporaryPasswordSuccessResponse(
          context,
          partner,
          identity.authUser.id,
          temporaryPassword,
        );
      }
      return json({
        success: false,
        error:
          "A senha foi atualizada, mas a limpeza segura da emissão ficou pendente. Não entregue esta senha; tente gerar uma nova depois.",
      }, 500);
    }
    if ("error" in completionAfterRejectedUpdate) {
      return json({
        success: false,
        error:
          "Não foi possível confirmar o estado da emissão após a rejeição do Auth. Não gere outra senha até revisar esta emissão.",
      }, 500);
    }

    return json({
      success: false,
      error:
        "O Auth recusou a senha, mas o resultado final da emissão ainda não pôde ser confirmado. Não gere outra senha até revisar esta emissão.",
    }, 500);
  }

  const completion = await completeTemporaryPasswordEmission(
    context,
    partner.id,
    issueId,
    actorAuthUserId,
  );
  if (!("completed" in completion) || !completion.completed) {
    // Não retornamos um segredo sem o estado canônico persistido. A trava do
    // banco permanece ativa até uma revisão segura da emissão pendente.
    return json({
      success: false,
      error:
        "A senha foi atualizada, mas não foi possível concluir o registro seguro. Não entregue esta senha; revise a emissão pendente antes de gerar outra.",
    }, 500);
  }

  const cleanup = await cleanTemporaryPasswordIssueMarker(
    context,
    partner.id,
    issueId,
    identity.authUser.id,
    actorAuthUserId,
  );
  if (!("cleaned" in cleanup) || !cleanup.cleaned) {
    return json({
      success: false,
      error:
        "A senha foi atualizada, mas a limpeza segura da emissão ficou pendente. Não entregue esta senha; tente gerar uma nova depois.",
    }, 500);
  }

  return temporaryPasswordSuccessResponse(
    context,
    partner,
    identity.authUser.id,
    temporaryPassword,
  );
};
