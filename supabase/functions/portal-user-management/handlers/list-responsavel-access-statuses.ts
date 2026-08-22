import { listAuthUsersByIdentity } from "../auth-users.ts";
import { isUuid, normalizeStringArray } from "../permissions.ts";
import type {
  HandlerContext,
  ResponsavelAccessStatus,
  ResponsavelAccessStatusValue,
} from "../types.ts";
import {
  loadPreparedResponsavelAccess,
  type PreparedResponsavelAccess,
  respondResponsavelAccessFailure,
  type ResponsavelAuthUser,
} from "./responsavel-access-context.ts";

const ACTION = "list-responsavel-access-statuses";
const MAX_RESPONSAVEIS = 500;
const PREPARATION_CONCURRENCY = 10;

const prepareInControlledBatches = async (
  context: HandlerContext,
  responsavelLegalIds: string[],
) => {
  const prepared: PreparedResponsavelAccess[] = [];
  for (
    let offset = 0;
    offset < responsavelLegalIds.length;
    offset += PREPARATION_CONCURRENCY
  ) {
    const batch = await Promise.all(
      responsavelLegalIds.slice(offset, offset + PREPARATION_CONCURRENCY).map(
        (responsavelLegalId) =>
          loadPreparedResponsavelAccess(context, responsavelLegalId),
      ),
    );
    for (const item of batch) {
      if ("failure" in item) return item;
      prepared.push(item);
    }
  }
  return prepared;
};

export const handleListResponsavelAccessStatuses = async (
  context: HandlerContext,
  responsavelLegalIdsInput: unknown,
) => {
  const requestedIds = normalizeStringArray(responsavelLegalIdsInput);
  if (requestedIds.length > MAX_RESPONSAVEIS) {
    return context.json({
      success: false,
      error: "Consulte no máximo 500 registros por vez.",
    }, 400);
  }
  const normalized = Array.from(
    new Set(requestedIds.map((id) => id.toLowerCase())),
  );
  if (normalized.some((id) => !isUuid(id))) {
    return context.json({
      success: false,
      error: "Todos os responsavelLegalIds devem ser UUIDs válidos.",
    }, 400);
  }
  if (normalized.length === 0) {
    return context.json({ success: true, action: ACTION, statuses: [] });
  }

  const prepared = await prepareInControlledBatches(context, normalized);
  if (!Array.isArray(prepared)) {
    return respondResponsavelAccessFailure(context, prepared);
  }

  const authUserIds = new Set<string>();
  const canonicalEmails = new Set<string>();
  for (const responsavel of prepared) {
    if (responsavel.authUserId) {
      authUserIds.add(responsavel.authUserId);
    } else if (responsavel.email) {
      canonicalEmails.add(responsavel.email);
    }
  }

  let usersById: Map<string, ResponsavelAuthUser>;
  let usersByEmail: Map<string, ResponsavelAuthUser>;
  try {
    ({ usersById, usersByEmail } = await listAuthUsersByIdentity(
      context.admin,
      authUserIds,
      canonicalEmails,
    ));
  } catch {
    return context.json({
      success: false,
      error:
        "Não foi possível consultar os estados de acesso dos responsáveis.",
    }, 500);
  }

  const statuses: ResponsavelAccessStatus[] = prepared.map((responsavel) => {
    // Um auth_user_id canônico ausente no Auth é inconsistência. O fallback por
    // e-mail é reservado ao convite ainda não vinculado.
    const authUser = responsavel.authUserId
      ? usersById.get(responsavel.authUserId) || null
      : responsavel.email
      ? usersByEmail.get(responsavel.email) || null
      : null;
    const emailConfirmed = Boolean(authUser?.email_confirmed_at);
    const status: ResponsavelAccessStatusValue = !responsavel.email
      ? "no_email"
      : !authUser
      ? "no_auth_user"
      : emailConfirmed
      ? "confirmed"
      : "pending";

    return {
      responsavelLegalId: responsavel.responsavelLegalId,
      status,
      authUserExists: Boolean(authUser),
      emailConfirmed,
      ...(typeof responsavel.emailValidatedByManager === "boolean"
        ? { emailValidatedByManager: responsavel.emailValidatedByManager }
        : {}),
      ...(typeof responsavel.temporaryPasswordPending === "boolean"
        ? { temporaryPasswordPending: responsavel.temporaryPasswordPending }
        : {}),
      ...(typeof responsavel.temporaryPasswordAllowed === "boolean"
        ? { temporaryPasswordAllowed: responsavel.temporaryPasswordAllowed }
        : {}),
      ...(typeof responsavel.requiresPasswordChange === "boolean"
        ? { requiresPasswordChange: responsavel.requiresPasswordChange }
        : {}),
      ...(typeof responsavel.termsAccepted === "boolean"
        ? { termsAccepted: responsavel.termsAccepted }
        : {}),
      ...(responsavel.currentTermsVersion
        ? { currentTermsVersion: responsavel.currentTermsVersion }
        : {}),
      ...(typeof responsavel.firstAccessPending === "boolean"
        ? { firstAccessPending: responsavel.firstAccessPending }
        : {}),
    };
  });

  return context.json({ success: true, action: ACTION, statuses });
};
