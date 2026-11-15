import { handleDiagnosticRequest } from "./diagnostic.ts";
import { reconcilePortalPdfReceivable } from "./portal-pdf-reconciliation.ts";
import { readRequestBody } from "./request-guards.ts";
import { json } from "./response.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// The handler authenticates the worker secret before reaching this dispatcher.
// A clone preserves the existing empty-body and diagnostic request paths.
export const handleWorkerActionRequest = async (
  req: Request,
  admin: any,
  reconcile: typeof reconcilePortalPdfReceivable = reconcilePortalPdfReceivable,
): Promise<Response | null> => {
  let body: unknown;
  try { body = await readRequestBody(req.clone()); }
  catch { return await handleDiagnosticRequest(req, admin); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    (body as Record<string, unknown>).action !== "reconcile_portal_pdf_receivable") {
    return await handleDiagnosticRequest(req, admin);
  }
  const input = body as Record<string, unknown>;
  if (typeof input.receivableId !== "string" || !uuid.test(input.receivableId) ||
    Object.keys(input).some((key) => !["action", "receivableId"].includes(key))) {
    return json({ error: "Ação de conciliação inválida." }, 400);
  }
  try {
    return json(await reconcile(admin, input.receivableId));
  } catch {
    // Reconciliation errors can contain bank responses. Never echo/log them.
    return json({ success: false, action: input.action, error: "Não foi possível concluir a conciliação isolada do legado." }, 422);
  }
};
