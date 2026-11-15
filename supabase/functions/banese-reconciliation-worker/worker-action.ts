import { handleDiagnosticRequest } from "./diagnostic.ts";
import { reconcilePortalPdfReceivable } from "./portal-pdf-reconciliation.ts";
import { isReviewedPaymentInput, reconcileReviewedPayment } from "./reviewed-payment.ts";
import { readRequestBody } from "./request-guards.ts";
import { json } from "./response.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// The handler authenticates the worker secret before reaching this dispatcher.
// A clone preserves the existing empty-body and diagnostic request paths.
export const handleWorkerActionRequest = async (
  req: Request,
  admin: any,
  reconcile: typeof reconcilePortalPdfReceivable = reconcilePortalPdfReceivable,
  reconcileReviewed: typeof reconcileReviewedPayment = reconcileReviewedPayment,
): Promise<Response | null> => {
  let body: unknown;
  try { body = await readRequestBody(req.clone()); }
  catch { return await handleDiagnosticRequest(req, admin); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    !["reconcile_portal_pdf_receivable", "reconcile_reviewed_payment"].includes(String((body as Record<string, unknown>).action))) {
    return await handleDiagnosticRequest(req, admin);
  }
  const input = body as Record<string, unknown>;
  if (input.action === "reconcile_reviewed_payment") {
    if (!isReviewedPaymentInput(input) ||
      Object.keys(input).some((key) => !["action", "receivableId", "expectedAmount", "expectedPaymentDate"].includes(key))) {
      return json({ error: "Ação de revisão inválida." }, 400);
    }
    try { return json(await reconcileReviewed(admin, input)); }
    catch {
      return json({ success: false, action: "reconcile_reviewed_payment", error: "Não foi possível confirmar a baixa revisada com os valores autorizados." }, 422);
    }
  }
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
