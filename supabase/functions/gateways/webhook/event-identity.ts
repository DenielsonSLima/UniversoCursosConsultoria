const firstNonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

/**
 * Resolve a identidade da notificacao, nunca a identidade do recurso.
 * `data.id` e `payment.id` sao IDs de pagamento e podem aparecer em varias
 * notificacoes (pending, approved, refunded etc.). Usa-los isoladamente faria
 * uma mudanca de estado valida parecer uma duplicata.
 */
export const resolveGatewayWebhookEventId = (input: {
  payload: Record<string, unknown>;
  requestId?: string | null;
  eventType?: string | null;
  remotePaymentId?: string | null;
  generatedId?: string;
}) => {
  const explicitNotificationId = firstNonEmpty(
    input.payload.id,
    input.payload.event_id,
  );
  if (explicitNotificationId) return explicitNotificationId;

  const requestId = firstNonEmpty(input.requestId);
  if (requestId) return `request:${requestId}`;

  const eventType = firstNonEmpty(
    input.eventType,
    input.payload.type,
    input.payload.event,
    input.payload.action,
    input.payload.topic,
  );
  const remotePaymentId = firstNonEmpty(input.remotePaymentId);
  const occurredAt = firstNonEmpty(
    input.payload.date_created,
    input.payload.date_last_updated,
    input.payload.created_at,
    input.payload.updated_at,
  );
  if (eventType && remotePaymentId && occurredAt) {
    return `derived:${eventType}:${remotePaymentId}:${occurredAt}`;
  }

  return `generated:${input.generatedId || crypto.randomUUID()}`;
};
