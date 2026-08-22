import { listAuthUsersByIdentity, normalizeEmail } from "../auth-users.ts";
import { getGestorScope, isPartnerAllowedByScope } from "../gestor-access.ts";
import { isUuid, normalizeStringArray } from "../permissions.ts";
import type {
  HandlerContext,
  PartnerEmailStatus,
  PartnerEmailStatusValue,
} from "../types.ts";

export const handleListPartnerEmailStatuses = async (
  context: HandlerContext,
  partnerIdsInput: unknown,
) => {
  const { admin, gestor, json } = context;
  const partnerIds = Array.from(new Set(normalizeStringArray(partnerIdsInput)))
    .filter(isUuid);

  if (partnerIds.length === 0) {
    return json({
      success: true,
      action: "list-partner-email-statuses",
      statuses: [],
    });
  }

  if (partnerIds.length > 500) {
    return json({
      success: false,
      error: "Consulte no máximo 500 registros por vez.",
    }, 400);
  }

  const { data: partners, error: partnersError } = await admin
    .from("parceiros")
    .select(
      "id, tipo, email, auth_user_id, auth_login_email, email_validado_gestor_em, polo_id, polo_ids",
    )
    .in("id", partnerIds);

  if (partnersError) {
    return json({ success: false, error: partnersError.message }, 500);
  }

  const scope = await getGestorScope(admin, gestor);
  const allowedPartners = (partners || []).filter((partner: any) =>
    isPartnerAllowedByScope(scope, partner)
  );
  const authUserIds = new Set<string>();
  const canonicalEmails = new Set<string>();
  for (const partner of allowedPartners) {
    if (partner.auth_user_id) {
      authUserIds.add(partner.auth_user_id);
      continue;
    }
    const canonicalEmail = normalizeEmail(partner.auth_login_email);
    if (canonicalEmail) canonicalEmails.add(canonicalEmail);
  }

  let usersById: Map<string, any>;
  let usersByEmail: Map<string, any>;
  try {
    ({ usersById, usersByEmail } = await listAuthUsersByIdentity(
      admin,
      authUserIds,
      canonicalEmails,
    ));
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error
        ? error.message
        : "Não foi possível consultar as confirmações de e-mail.",
    }, 500);
  }

  const statuses: PartnerEmailStatus[] = allowedPartners.map((partner: any) => {
    const contactEmail = normalizeEmail(partner.email);
    const canonicalEmail = normalizeEmail(partner.auth_login_email);
    // Um ID canônico ausente no Auth é inconsistência e nunca deve cair para
    // busca por e-mail. O fallback usa somente auth_login_email, que é a
    // identidade normalizada e única dos alunos no banco.
    const authUser = partner.auth_user_id
      ? usersById.get(partner.auth_user_id) || null
      : canonicalEmail
      ? usersByEmail.get(canonicalEmail) || null
      : null;
    const emailConfirmed = Boolean(authUser?.email_confirmed_at);
    const status: PartnerEmailStatusValue = !contactEmail
      ? "no_email"
      : !authUser
      ? "no_auth_user"
      : emailConfirmed
      ? "confirmed"
      : "pending";

    return {
      partnerId: partner.id,
      status,
      authUserExists: Boolean(authUser),
      emailConfirmed,
      emailValidatedByManager: Boolean(partner.email_validado_gestor_em),
    };
  });

  return json({
    success: true,
    action: "list-partner-email-statuses",
    statuses,
  });
};
