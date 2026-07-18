import { listAuthUsersByEmail, normalizeEmail } from "../auth-users.ts";
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
    .select("id, email, polo_id, polo_ids")
    .in("id", partnerIds);

  if (partnersError) {
    return json({ success: false, error: partnersError.message }, 500);
  }

  const scope = await getGestorScope(admin, gestor);
  const allowedPartners = (partners || []).filter((partner: any) =>
    isPartnerAllowedByScope(scope, partner)
  );
  const emails = new Set<string>(
    allowedPartners.map((partner: any) => normalizeEmail(partner.email)).filter(
      Boolean,
    ),
  );

  let usersByEmail: Map<string, any>;
  try {
    usersByEmail = await listAuthUsersByEmail(admin, emails);
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error
        ? error.message
        : "Não foi possível consultar as confirmações de e-mail.",
    }, 500);
  }

  const statuses: PartnerEmailStatus[] = allowedPartners.map((partner: any) => {
    const email = normalizeEmail(partner.email);
    const authUser = email ? usersByEmail.get(email) : null;
    const emailConfirmed = Boolean(
      authUser?.email_confirmed_at || authUser?.confirmed_at,
    );
    const status: PartnerEmailStatusValue = !email
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
    };
  });

  return json({
    success: true,
    action: "list-partner-email-statuses",
    statuses,
  });
};
