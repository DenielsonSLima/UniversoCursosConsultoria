import type { HandlerContext } from "../types.ts";

type EmissionTargetParameter =
  | "p_partner_id"
  | "p_responsavel_legal_id";

type TemporaryPasswordEmissionConfig = {
  targetParameter: EmissionTargetParameter;
  reserveRpc: string;
  completeRpc: string;
  cancelRpc: string;
  confirmCleanupRpc: string;
  issueMetadataKey: string;
  writeNonceMetadataKey: string;
};

export type TemporaryPasswordEmissionRpcResult = {
  value: boolean;
  failed: boolean;
  errorCode?: string;
  errorMessage?: string;
};

type AuthUserWithAppMetadata = {
  app_metadata?: Record<string, unknown> | null;
};

const appMetadataFrom = (authUser: AuthUserWithAppMetadata) =>
  authUser?.app_metadata && typeof authUser.app_metadata === "object" &&
    !Array.isArray(authUser.app_metadata)
    ? authUser.app_metadata
    : {};

export const createTemporaryPasswordEmissionCoordinator = (
  config: TemporaryPasswordEmissionConfig,
) => {
  const issueIdFromAuthUser = (authUser: AuthUserWithAppMetadata) =>
    String(appMetadataFrom(authUser)[config.issueMetadataKey] || "").trim();

  const writeNonceFromAuthUser = (authUser: AuthUserWithAppMetadata) =>
    String(appMetadataFrom(authUser)[config.writeNonceMetadataKey] || "")
      .trim();

  const appMetadataWithIssue = (
    authUser: AuthUserWithAppMetadata,
    issueId: string,
  ) => ({
    ...appMetadataFrom(authUser),
    [config.issueMetadataKey]: issueId,
    [config.writeNonceMetadataKey]: issueId,
  });

  const appMetadataWithoutIssue = (authUser: AuthUserWithAppMetadata) => ({
    ...appMetadataFrom(authUser),
    // GoTrue mescla app_metadata; null remove as chaves desta emissão.
    [config.issueMetadataKey]: null,
    [config.writeNonceMetadataKey]: null,
  });

  const runRpc = async (
    context: HandlerContext,
    name: string,
    targetId: string,
    issueId: string,
    actorAuthUserId: string,
  ): Promise<TemporaryPasswordEmissionRpcResult> => {
    try {
      const { data, error } = await context.admin.rpc(name, {
        [config.targetParameter]: targetId,
        p_emissao_id: issueId,
        p_actor_auth_user_id: actorAuthUserId,
      });
      if (error) {
        return {
          value: false,
          failed: true,
          errorCode: String(error.code || ""),
          errorMessage: String(error.message || ""),
        };
      }
      return { value: data === true, failed: false };
    } catch {
      return { value: false, failed: true };
    }
  };

  const reserve = (
    context: HandlerContext,
    targetId: string,
    issueId: string,
    actorAuthUserId: string,
  ) => runRpc(context, config.reserveRpc, targetId, issueId, actorAuthUserId);

  const complete = (
    context: HandlerContext,
    targetId: string,
    issueId: string,
    actorAuthUserId: string,
  ) => runRpc(context, config.completeRpc, targetId, issueId, actorAuthUserId);

  const cancel = (
    context: HandlerContext,
    targetId: string,
    issueId: string,
    actorAuthUserId: string,
  ) => runRpc(context, config.cancelRpc, targetId, issueId, actorAuthUserId);

  const confirmCleanup = (
    context: HandlerContext,
    targetId: string,
    issueId: string,
    actorAuthUserId: string,
  ) =>
    runRpc(
      context,
      config.confirmCleanupRpc,
      targetId,
      issueId,
      actorAuthUserId,
    );

  const markIssueInAuth = async (
    context: HandlerContext,
    authUserId: string,
    issueId: string,
  ) => {
    let authUser: AuthUserWithAppMetadata;
    try {
      const { data, error } = await context.admin.auth.admin.getUserById(
        authUserId,
      );
      if (error || !data?.user) {
        return {
          marked: false,
          error:
            "Não foi possível preparar a identidade para a emissão da senha temporária.",
        };
      }
      authUser = data.user;
    } catch {
      return {
        marked: false,
        error:
          "Não foi possível preparar a identidade para a emissão da senha temporária.",
      };
    }

    const currentIssueId = issueIdFromAuthUser(authUser);
    const currentWriteNonce = writeNonceFromAuthUser(authUser);
    if (
      (currentIssueId && currentIssueId !== issueId) ||
      (currentWriteNonce && currentWriteNonce !== issueId)
    ) {
      return {
        marked: false,
        error:
          "Existe um marcador técnico de outra emissão que precisa ser revisado antes de gerar uma senha.",
      };
    }

    let markerUpdateFailed = false;
    if (currentIssueId !== issueId || currentWriteNonce !== issueId) {
      try {
        // UserUpdate grava a senha antes de app_metadata. Marcador e nonce
        // precisam ser stageados e confirmados antes da chamada password-only.
        const { error } = await context.admin.auth.admin.updateUserById(
          authUserId,
          { app_metadata: appMetadataWithIssue(authUser, issueId) },
        );
        markerUpdateFailed = Boolean(error);
      } catch {
        markerUpdateFailed = true;
        // Uma resposta pode se perder depois do commit; a leitura é canônica.
      }
    }

    try {
      const { data, error } = await context.admin.auth.admin.getUserById(
        authUserId,
      );
      if (
        !error && data?.user &&
        issueIdFromAuthUser(data.user) === issueId &&
        writeNonceFromAuthUser(data.user) === issueId
      ) {
        return { marked: true };
      }
    } catch {
      // Falha fechada: a senha nunca muda sem confirmação dos dois marcadores.
    }

    return {
      marked: false,
      error: markerUpdateFailed
        ? "O Auth não confirmou o marcador seguro da emissão da senha temporária."
        : "Não foi possível confirmar o marcador seguro da emissão da senha temporária.",
    };
  };

  const cleanIssueMarker = async (
    context: HandlerContext,
    targetId: string,
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
          cleaned: false,
          error:
            "Não foi possível localizar a identidade para concluir a limpeza da emissão.",
        };
      }

      const currentIssueId = issueIdFromAuthUser(data.user);
      const currentWriteNonce = writeNonceFromAuthUser(data.user);
      if (
        (currentIssueId && currentIssueId !== issueId) ||
        (currentWriteNonce && currentWriteNonce !== issueId)
      ) {
        return {
          cleaned: false,
          error:
            "A identidade contém marcadores de outra emissão e requer revisão.",
        };
      }
      if (currentIssueId === issueId || currentWriteNonce === issueId) {
        try {
          const { error: updateError } = await context.admin.auth.admin
            .updateUserById(authUserId, {
              app_metadata: appMetadataWithoutIssue(data.user),
            });
          cleanupUpdateFailed = Boolean(updateError);
        } catch {
          cleanupUpdateFailed = true;
          // A RPC relê auth.users e só libera a reserva após remoção real.
        }
      }
    } catch {
      return {
        cleaned: false,
        error:
          "Não foi possível localizar a identidade para concluir a limpeza da emissão.",
      };
    }

    const confirmation = await confirmCleanup(
      context,
      targetId,
      issueId,
      actorAuthUserId,
    );
    if (!confirmation.failed && confirmation.value) return { cleaned: true };
    return {
      cleaned: false,
      error: cleanupUpdateFailed && !confirmation.failed
        ? "Não foi possível remover o marcador técnico da emissão."
        : confirmation.errorMessage ||
          "Não foi possível concluir a limpeza da emissão.",
    };
  };

  const cancelAndCleanIssue = async (
    context: HandlerContext,
    targetId: string,
    issueId: string,
    authUserId: string,
    actorAuthUserId: string,
  ) => {
    const cancellation = await cancel(
      context,
      targetId,
      issueId,
      actorAuthUserId,
    );
    if (cancellation.failed || !cancellation.value) {
      return { cleaned: false, cancellationFailed: true };
    }
    return cleanIssueMarker(
      context,
      targetId,
      issueId,
      authUserId,
      actorAuthUserId,
    );
  };

  return {
    reserve,
    complete,
    cancel,
    confirmCleanup,
    markIssueInAuth,
    cleanIssueMarker,
    cancelAndCleanIssue,
  };
};
