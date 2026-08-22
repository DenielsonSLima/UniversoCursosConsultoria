import { createClient } from "@supabase/supabase-js";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json as sendJson,
} from "../_shared/http.ts";
import { ensureAuthorizedGestor, loadManagedPartner } from "./gestor-access.ts";
import { handleConfirmPartnerEmail } from "./handlers/confirm-partner-email.ts";
import { handleDeletePartner } from "./handlers/delete-partner.ts";
import { handleEnsureProfessorAccess } from "./handlers/ensure-professor-access.ts";
import { handleEnsureResponsavelAccess } from "./handlers/ensure-responsavel-access.ts";
import { handleIssueStudentTemporaryPassword } from "./handlers/issue-student-temporary-password.ts";
import { handleListPartnerEmailStatuses } from "./handlers/list-partner-email-statuses.ts";
import { handleLinkProfessorAuthIdentity } from "./handlers/link-professor-auth-identity.ts";
import { handleSendStudentInvite } from "./handlers/send-student-invite.ts";
import { handleUpsertGestorUser } from "./handlers/upsert-gestor-user.ts";
import {
  handleDeleteGestorUser,
  handleListGestorUserManagementStates,
  handleSetGestorUserStatus,
} from "./handlers/manage-gestor-user.ts";
import { gestorHasModule } from "./permissions.ts";
import { resolveSupabasePublicApiKey } from "./redirects.ts";
import type {
  FunctionResponse,
  HandlerContext,
  IncomingPayload,
} from "./types.ts";

const VALID_ACTIONS = [
  "send-student-invite",
  "delete-partner",
  "upsert-gestor-user",
  "list-gestor-user-management-states",
  "set-gestor-user-status",
  "delete-gestor-user",
  "list-partner-email-statuses",
  "confirm-partner-email",
  "issue-student-temporary-password",
  "link-professor-auth-identity",
  "ensure-professor-access",
  "ensure-responsavel-access",
] as const;

const GESTOR_USER_ACTIONS = new Set([
  "upsert-gestor-user",
  "list-gestor-user-management-states",
  "set-gestor-user-status",
  "delete-gestor-user",
]);

Deno.serve(async (req: Request) => {
  const corsHeadersForRequest = buildCorsHeaders(req);
  const json = (payload: FunctionResponse, status = 200) => {
    const response = sendJson(payload, status, req);
    if (!Object.prototype.hasOwnProperty.call(payload, "temporaryPassword")) {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
    return new Response(response.body, { status: response.status, headers });
  };

  if (
    isRateLimitExceeded(`portal-user-management:${getClientIp(req)}`, 40, 60000)
  ) {
    return json({
      success: false,
      error: "Muitas tentativas. Tente novamente em alguns instantes.",
    }, 429);
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersForRequest });
  }

  if (req.method !== "POST") {
    return json({ success: false, error: "Método não permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json(
      { success: false, error: "Configuração do Supabase ausente." },
      500,
    );
  }

  const publicApiKey = resolveSupabasePublicApiKey(serviceRoleKey);
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let payload: IncomingPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ success: false, error: "Payload inválido." }, 400);
  }

  const action = String(payload.action || "").trim();
  if (!VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
    return json({ success: false, error: "Ação inválida." }, 400);
  }

  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : null;
  const authorization = await ensureAuthorizedGestor(admin, bearer);

  if (!authorization.authorized) {
    return json({
      success: false,
      error: authorization.error || "Não autorizado.",
    }, 401);
  }

  if (
    !GESTOR_USER_ACTIONS.has(action) &&
    !gestorHasModule(authorization.gestor, "parceiros")
  ) {
    return json({
      success: false,
      error: "Você não tem acesso ao módulo Parceiros.",
    }, 403);
  }

  const context: HandlerContext = {
    admin,
    gestor: authorization.gestor,
    gestorEmail: authorization.gestorEmail,
    json,
  };

  if (action === "list-partner-email-statuses") {
    return handleListPartnerEmailStatuses(context, payload.partnerIds);
  }

  if (action === "upsert-gestor-user") {
    return handleUpsertGestorUser(
      context,
      payload.user || {},
    );
  }

  if (action === "list-gestor-user-management-states") {
    return handleListGestorUserManagementStates(context, payload.userIds);
  }

  if (action === "set-gestor-user-status") {
    return handleSetGestorUserStatus(context, payload.userId, payload.status);
  }

  if (action === "delete-gestor-user") {
    return handleDeleteGestorUser(context, payload.userId);
  }

  if (action === "ensure-responsavel-access") {
    return handleEnsureResponsavelAccess(
      context,
      payload.responsavelLegalId,
      payload.requestId,
    );
  }

  const partnerId = String(payload.partnerId || "").trim();
  const partner = await loadManagedPartner(
    admin,
    authorization.gestor,
    partnerId,
    json,
  );
  if (partner instanceof Response) return partner;

  if (action === "confirm-partner-email") {
    return handleConfirmPartnerEmail(
      context,
      partner,
      payload.emailValidatedByManager === true,
    );
  }

  if (action === "issue-student-temporary-password") {
    return handleIssueStudentTemporaryPassword(context, partner);
  }

  if (action === "delete-partner") {
    return handleDeletePartner(context, partner);
  }

  if (action === "link-professor-auth-identity") {
    return handleLinkProfessorAuthIdentity(context, partner);
  }

  if (action === "ensure-professor-access") {
    return handleEnsureProfessorAccess(context, partner);
  }

  return handleSendStudentInvite(context, partner, {
    email: payload.email,
    redirectTo: payload.redirectTo,
    supabaseUrl,
    publicApiKey,
  });
});
