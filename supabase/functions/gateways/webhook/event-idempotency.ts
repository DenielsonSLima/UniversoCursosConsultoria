export const GATEWAY_WEBHOOK_PROCESSING_LEASE_MS = 5 * 60 * 1000;

export const webhookReviewMarker = (result: unknown) => {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }
  const record = result as Record<string, unknown>;
  if (record.reviewRequired !== true) return null;
  const reason = String(
    record.reviewReason || record.reason || "manual_review_required",
  ).trim();
  const receivableId = String(record.receivableId || "").trim();
  return [
    "REVIEW_REQUIRED",
    reason,
    receivableId ? `receivable_id=${receivableId}` : null,
  ].filter(Boolean).join(" | ");
};

export type DuplicateWebhookEventAction =
  | "acknowledge"
  | "processing"
  | "retry";

export const duplicateWebhookHttpStatus = (processing: boolean) =>
  processing ? 503 : 200;

export const duplicateWebhookEventAction = (
  existingEvent: {
    processed?: unknown;
    processing_error?: unknown;
    processed_at?: unknown;
    received_at?: unknown;
  },
  nowMs = Date.now(),
): DuplicateWebhookEventAction => {
  if (existingEvent.processed === true) return "acknowledge";
  if (
    existingEvent.processing_error !== null &&
    existingEvent.processing_error !== undefined
  ) {
    return "retry";
  }
  if (existingEvent.processed_at) return "retry";

  const receivedAtMs = Date.parse(String(existingEvent.received_at || ""));
  if (
    !Number.isFinite(receivedAtMs) ||
    nowMs - receivedAtMs >= GATEWAY_WEBHOOK_PROCESSING_LEASE_MS
  ) {
    return "retry";
  }
  return "processing";
};

export const registerGatewayWebhookEvent = async (
  admin: any,
  event: {
    providerCode: string;
    environment: string;
    eventId: string;
    eventType: string;
    remotePaymentId: string | null;
    payload: unknown;
  },
) => {
  const row = {
    provider_code: event.providerCode,
    environment: event.environment,
    event_id: event.eventId,
    event_type: event.eventType,
    remote_payment_id: event.remotePaymentId,
    payload: event.payload,
    processed: false,
    processing_error: null,
    received_at: new Date().toISOString(),
  };

  const { error: insertError } = await admin
    .from("payment_gateway_webhook_events")
    .insert(row);

  if (!insertError) {
    return { duplicate: false, shouldProcess: true };
  }
  if (insertError.code !== "23505") throw insertError;

  const { data: existingEvent, error: existingError } = await admin
    .from("payment_gateway_webhook_events")
    .select("processed, processing_error, processed_at, received_at")
    .eq("provider_code", event.providerCode)
    .eq("environment", event.environment)
    .eq("event_id", event.eventId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existingEvent) {
    throw new Error("Evento duplicado nao encontrado para idempotencia.");
  }

  const action = duplicateWebhookEventAction(existingEvent);
  if (action === "acknowledge") {
    return { duplicate: true, shouldProcess: false };
  }
  if (action === "processing") {
    return { duplicate: true, processing: true, shouldProcess: false };
  }

  // A comparacao com o estado lido funciona como uma aquisicao atomica: dois
  // retries concorrentes nao conseguem reivindicar o mesmo evento.
  let retryClaim = admin
    .from("payment_gateway_webhook_events")
    .update({
      event_type: event.eventType,
      remote_payment_id: event.remotePaymentId,
      payload: event.payload,
      processing_error: null,
      processed_at: null,
      received_at: row.received_at,
    })
    .eq("provider_code", event.providerCode)
    .eq("environment", event.environment)
    .eq("event_id", event.eventId)
    .eq("processed", false);
  retryClaim = existingEvent.processing_error === null
    ? retryClaim.is("processing_error", null)
    : retryClaim.eq("processing_error", existingEvent.processing_error);
  retryClaim = existingEvent.processed_at === null
    ? retryClaim.is("processed_at", null)
    : retryClaim.eq("processed_at", existingEvent.processed_at);
  retryClaim = retryClaim.eq("received_at", existingEvent.received_at);

  const { data: claimedEvent, error: retryUpdateError } = await retryClaim
    .select("id")
    .maybeSingle();
  if (retryUpdateError) throw retryUpdateError;
  if (!claimedEvent) {
    return { duplicate: true, processing: true, shouldProcess: false };
  }

  return { duplicate: true, shouldProcess: true };
};
