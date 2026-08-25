import type { HandlerContext } from "../types.ts";
import { logPortalHandlerFailure } from "./handler-error-log.ts";

const ACTION = "ensure-professor-access";
const LOOKUP_ERROR = "Não foi possível verificar o vínculo atual do professor.";

export const readCurrentProfessorBinding = async (
  admin: HandlerContext["admin"],
  partnerId: string,
) => {
  try {
    const { data, error } = await admin
      .from("parceiros")
      .select("id, tipo, status, email, auth_user_id, auth_login_email")
      .eq("id", partnerId)
      .maybeSingle();
    if (error) {
      logPortalHandlerFailure(ACTION, "read-current-partner", error);
      return { partner: null, error: LOOKUP_ERROR };
    }
    return { partner: data || null, error: null };
  } catch (error) {
    logPortalHandlerFailure(ACTION, "read-current-partner", error);
    return { partner: null, error: LOOKUP_ERROR };
  }
};
