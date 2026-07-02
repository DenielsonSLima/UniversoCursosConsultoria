export const registerWebhookEvent = async (
  admin: any,
  input: {
    eventId: string;
    eventType: string;
    paymentId?: string | null;
    payload: any;
  },
) => {
  const { error: insertError } = await admin.from("asaas_webhook_events").insert({
    event_id: input.eventId,
    event_type: input.eventType,
    payment_id: input.paymentId || null,
    payload: input.payload,
  });

  if (insertError?.code === "23505") {
    const { data: existingEvent, error: existingError } = await admin
      .from("asaas_webhook_events")
      .select("processed")
      .eq("event_id", input.eventId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingEvent?.processed === true) {
      return { duplicateProcessed: true };
    }

    const { error: retryUpdateError } = await admin
      .from("asaas_webhook_events")
      .update({
        event_type: input.eventType,
        payment_id: input.paymentId || null,
        payload: input.payload,
        processed: false,
        processing_error: null,
        received_at: new Date().toISOString(),
      })
      .eq("event_id", input.eventId);
    if (retryUpdateError) throw retryUpdateError;
  }

  if (insertError && insertError.code !== "23505") throw insertError;
  return { duplicateProcessed: false };
};

export const markWebhookEventProcessed = async (admin: any, eventId: string) => {
  await admin.from("asaas_webhook_events").update({
    processed: true,
    processing_error: null,
    processed_at: new Date().toISOString(),
  }).eq("event_id", eventId);
};

export const markWebhookEventFailed = async (admin: any, eventId: string, error: unknown) => {
  await admin.from("asaas_webhook_events").update({
    processed: false,
    processing_error: error instanceof Error ? error.message : String(error),
    processed_at: new Date().toISOString(),
  }).eq("event_id", eventId);
};
