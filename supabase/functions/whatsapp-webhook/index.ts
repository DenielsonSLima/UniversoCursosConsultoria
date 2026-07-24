import { createClient } from "npm:@supabase/supabase-js@2";
import {
  findAlunoByPhone,
  insertWhatsAppMessage,
  normalizeWhatsAppPhone,
  textFromWhatsAppMessage,
  upsertWhatsAppConversation,
} from "../_shared/whatsapp.ts";
import { processWhatsAppFlow } from "../_shared/whatsapp-flow/engine.ts";
import {
  findWhatsAppConnectionByMeta,
  getWhatsAppConnectionSecret,
  WhatsAppConnection,
} from "../_shared/whatsapp-connection.ts";

type FlowTask = () => Promise<void>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const text = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain" },
  });

const createAdmin = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Ambiente Supabase incompleto para webhook WhatsApp.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const mirrorLegacyConnectionState = async (
  admin: any,
  connectionId: string,
  update: Record<string, unknown>,
) => {
  const { data: connection, error } = await admin
    .from("whatsapp_conexoes")
    .select("is_matriz_financeira")
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw error;
  if (!connection?.is_matriz_financeira) return;

  const { error: legacyError } = await admin
    .from("mensageria_config")
    .update(update)
    .eq("tipo", "whatsapp");
  if (legacyError) throw legacyError;
};

const verifyTokenMatchesConnection = async (admin: any, token: string) => {
  const { data: connections, error } = await admin
    .from("whatsapp_conexoes")
    .select("id,is_matriz_financeira")
    .eq("status", "ativo");
  if (error) throw error;
  for (const connection of connections || []) {
    const expected = await getWhatsAppConnectionSecret(
      admin,
      connection.id,
      "verify_token",
    );
    if (expected && safeEqual(token, expected)) return connection;
  }
  return null;
};

const hexFromBuffer = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const safeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
};

const validateSignature = async (
  admin: any,
  connectionId: string,
  req: Request,
  rawBody: string,
) => {
  const appSecret = await getWhatsAppConnectionSecret(
    admin,
    connectionId,
    "app_secret",
  );
  if (!appSecret) {
    throw new Error(
      "App Secret do WhatsApp nao configurado para validar webhook.",
    );
  }

  const signature = String(req.headers.get("x-hub-signature-256") || "").trim();
  if (!signature.startsWith("sha256=")) {
    throw new Error("Assinatura do webhook WhatsApp ausente.");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const expected = `sha256=${hexFromBuffer(digest)}`;
  if (!safeEqual(signature, expected)) {
    throw new Error("Assinatura do webhook WhatsApp invalida.");
  }
};

const validatePayloadSource = async (
  admin: any,
  payload: any,
): Promise<WhatsAppConnection> => {
  if (payload?.object !== "whatsapp_business_account") {
    throw new Error("Evento WhatsApp com objeto invalido.");
  }

  const firstEntry = payload?.entry?.[0];
  const firstChange = firstEntry?.changes?.[0];
  const receivedPhoneId = String(
    firstChange?.value?.metadata?.phone_number_id || "",
  ).trim();
  const receivedWabaId = String(firstEntry?.id || "").trim();
  const connection = await findWhatsAppConnectionByMeta(
    admin,
    receivedPhoneId,
    receivedWabaId,
  );
  if (!connection) {
    throw new Error("Webhook recebido para uma linha WhatsApp não cadastrada.");
  }
  if (connection.status !== "ativo") {
    throw new Error("Webhook recebido para uma linha WhatsApp inativa.");
  }

  const expectedPhoneId = String(connection.phone_number_id || "").trim();
  const expectedWabaId = String(connection.waba_id || "").trim();

  for (const entry of payload?.entry || []) {
    const receivedWabaId = String(entry?.id || "").trim();
    if (expectedWabaId && receivedWabaId && receivedWabaId !== expectedWabaId) {
      throw new Error(
        "Webhook recebido para uma WABA diferente da configurada.",
      );
    }

    for (const change of entry?.changes || []) {
      const receivedPhoneId = String(
        change?.value?.metadata?.phone_number_id || "",
      ).trim();
      if (
        expectedPhoneId && receivedPhoneId &&
        receivedPhoneId !== expectedPhoneId
      ) {
        throw new Error(
          "Webhook recebido para um Phone Number ID diferente do configurado.",
        );
      }
    }
  }
  return connection;
};

const processFlowSafely = async (
  admin: any,
  input: {
    conversation: any;
    aluno: any | null;
    phone: string;
    content: string;
  },
) => {
  try {
    await processWhatsAppFlow(admin, {
      conversation: input.conversation,
      alunoByPhone: input.aluno,
      phone: input.phone,
      content: input.content,
    });
  } catch (flowError) {
    console.error("whatsapp-flow error:", flowError);
    await admin.from("whatsapp_flow_events").insert({
      conversa_id: input.conversation.id,
      aluno_id: input.aluno?.id || null,
      event_type: "flow_error",
      details: {
        message: flowError instanceof Error
          ? flowError.message
          : "Erro inesperado no fluxo WhatsApp.",
      },
    });
  }
};

const scheduleFlowTasks = async (tasks: FlowTask[]) => {
  const run = async () => {
    for (const task of tasks) await task();
  };
  const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
  if (typeof waitUntil === "function") {
    waitUntil(run());
    return;
  }
  await run();
};

const processMessage = async (
  admin: any,
  message: any,
  contact: any,
  connectionId: string,
): Promise<FlowTask | null> => {
  const phone = normalizeWhatsAppPhone(message?.from);
  if (!phone) return null;

  const aluno = await findAlunoByPhone(admin, phone);
  const content = textFromWhatsAppMessage(message);
  const conversation = await upsertWhatsAppConversation(admin, {
    connectionId,
    phone,
    aluno,
    contactName: contact?.profile?.name || aluno?.nome || phone,
    lastText: content,
    direction: "entrada",
  });

  const insertedMessage = await insertWhatsAppMessage(admin, {
    conversaId: conversation.id,
    alunoId: aluno?.id || null,
    metaMessageId: message?.id || null,
    direction: "entrada",
    senderType: "aluno",
    senderName: aluno?.nome || contact?.profile?.name || phone,
    content,
    messageType: String(message?.type || "text"),
    status: "received",
    rawPayload: message,
    read: false,
  });

  if (!insertedMessage || message?.type === "unsupported") return null;
  return () =>
    processFlowSafely(admin, { conversation, aluno, phone, content });
};

const processStatus = async (admin: any, status: any) => {
  const messageId = String(status?.id || "").trim();
  if (!messageId) return;

  const { error } = await admin.rpc("whatsapp_apply_message_status", {
    p_message_id: messageId,
    p_status: String(status?.status || "status"),
    p_payload: status,
  });
  if (error) throw error;
};

const timestampToIso = (value: unknown) => {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const millis = timestamp > 9999999999 ? timestamp : timestamp * 1000;
  return new Date(millis).toISOString();
};

const processMessageEcho = async (
  admin: any,
  echo: any,
  connectionId: string,
) => {
  const phone = normalizeWhatsAppPhone(echo?.to);
  if (!phone) return;

  const aluno = await findAlunoByPhone(admin, phone);
  const content = textFromWhatsAppMessage(echo);
  const createdAt = timestampToIso(echo?.timestamp);
  const conversation = await upsertWhatsAppConversation(admin, {
    connectionId,
    phone,
    aluno,
    lastText: content,
    direction: "saida",
    lastAt: createdAt,
  });

  await insertWhatsAppMessage(admin, {
    conversaId: conversation.id,
    alunoId: aluno?.id || null,
    metaMessageId: echo?.id || null,
    direction: "saida",
    senderType: "gestor",
    senderName: "WhatsApp Business App",
    content,
    messageType: String(echo?.type || "text"),
    status: "sent",
    rawPayload: echo,
    read: true,
    createdAt,
  });
};

const processHistoryMessage = async (
  admin: any,
  input: {
    threadId?: unknown;
    message: any;
    businessPhone?: unknown;
    connectionId: string;
  },
) => {
  const businessPhone = normalizeWhatsAppPhone(input.businessPhone);
  const from = normalizeWhatsAppPhone(input.message?.from);
  const to = normalizeWhatsAppPhone(input.message?.to);
  const threadPhone = normalizeWhatsAppPhone(
    input.threadId || input.message?.context?.wa_id,
  );
  const isOutgoing = Boolean(
    to || (businessPhone && from && businessPhone === from),
  );
  const phone = isOutgoing ? to || threadPhone : from || threadPhone;
  if (!phone) return;

  const aluno = await findAlunoByPhone(admin, phone);
  const content = textFromWhatsAppMessage(input.message);
  const createdAt = timestampToIso(input.message?.timestamp);
  const conversation = await upsertWhatsAppConversation(admin, {
    connectionId: input.connectionId,
    phone,
    aluno,
    lastText: content,
    direction: isOutgoing ? "saida" : "entrada",
    incrementUnread: false,
    lastAt: createdAt,
  });

  await insertWhatsAppMessage(admin, {
    conversaId: conversation.id,
    alunoId: aluno?.id || null,
    metaMessageId: input.message?.id || null,
    direction: isOutgoing ? "saida" : "entrada",
    senderType: isOutgoing ? "gestor" : "aluno",
    senderName: isOutgoing ? "WhatsApp Business App" : aluno?.nome || phone,
    content,
    messageType: String(input.message?.type || "text"),
    status: input.message?.history_context?.status || "history",
    rawPayload: input.message,
    read: true,
    createdAt,
  });
};

const processStateSync = async (
  admin: any,
  value: any,
  connectionId: string,
) => {
  let synchronized = 0;
  for (const item of value?.state_sync || []) {
    if (item?.type !== "contact" || item?.action !== "add") continue;
    const phone = normalizeWhatsAppPhone(item?.contact?.phone_number);
    const name = String(
      item?.contact?.full_name || item?.contact?.first_name || "",
    ).trim();
    if (!phone || !name) continue;

    const { data: conversation, error } = await admin
      .from("whatsapp_conversas")
      .select("id, aluno_id")
      .eq("conexao_id", connectionId)
      .eq("telefone", phone)
      .maybeSingle();
    if (error) throw error;
    if (!conversation || conversation.aluno_id) continue;

    const { error: updateError } = await admin
      .from("whatsapp_conversas")
      .update({ contato_nome: name, updated_at: new Date().toISOString() })
      .eq("id", conversation.id);
    if (updateError) throw updateError;
    synchronized += 1;
  }

  await admin
    .from("whatsapp_conexoes")
    .update({
      contacts_sync_status: "receiving",
      last_health_check_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  await mirrorLegacyConnectionState(admin, connectionId, {
    wa_contacts_sync_status: "receiving",
    wa_last_health_check_at: new Date().toISOString(),
  });

  return synchronized;
};

const processAccountUpdate = async (
  admin: any,
  wabaId: unknown,
  value: any,
) => {
  const event = String(value?.event || "").trim().toUpperCase();
  if (!event) return;

  const update: Record<string, unknown> = {
    wa_last_account_event: event,
    wa_last_account_event_at: new Date().toISOString(),
  };
  if (event === "PARTNER_REMOVED" || event === "ACCOUNT_OFFBOARDED") {
    update.wa_enabled = false;
    update.wa_status = "desconectado";
  } else if (event === "ACCOUNT_RECONNECTED") {
    update.wa_enabled = true;
    update.wa_status = "configurado";
  }

  const { error } = await admin
    .from("mensageria_config")
    .update(update)
    .eq("tipo", "whatsapp")
    .eq("wa_business_account_id", String(wabaId || "").trim());
  if (error) throw error;

  await admin
    .from("whatsapp_conexoes")
    .update({
      status: event === "PARTNER_REMOVED" || event === "ACCOUNT_OFFBOARDED"
        ? "inativo"
        : "ativo",
      last_account_event: event,
      last_account_event_at: new Date().toISOString(),
      last_error: event === "PARTNER_REMOVED" ||
          event === "ACCOUNT_OFFBOARDED"
        ? "A linha foi desconectada da Meta."
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("waba_id", String(wabaId || "").trim());
};

const processHistoryChunk = async (
  admin: any,
  value: any,
  historyChunk: any,
  connectionId: string,
) => {
  const errors = Array.isArray(historyChunk?.errors) ? historyChunk.errors : [];
  if (errors.length > 0) {
    const declined = errors.some((error: any) =>
      Number(error?.code) === 2593109
    );
    const { error: connectionError } = await admin
      .from("whatsapp_conexoes")
      .update({
        history_sync_status: declined ? "declined" : "error",
        last_health_check_at: new Date().toISOString(),
        last_error: declined
          ? "Sincronização de histórico recusada no WhatsApp Business App."
          : "A Meta retornou erro ao sincronizar o histórico.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId);
    if (connectionError) throw connectionError;

    await mirrorLegacyConnectionState(admin, connectionId, {
      wa_history_sync_status: declined ? "declined" : "error",
      wa_last_health_check_at: new Date().toISOString(),
    });
    return;
  }

  for (const thread of historyChunk?.threads || []) {
    const threadId = thread?.context?.wa_id || thread?.id;
    for (const message of thread?.messages || []) {
      await processHistoryMessage(admin, {
        threadId,
        message,
        businessPhone: value?.metadata?.display_phone_number,
        connectionId,
      });
    }
  }

  const progress = Number(historyChunk?.metadata?.progress);
  const boundedProgress = Number.isFinite(progress)
    ? Math.max(0, Math.min(progress, 100))
    : null;
  const { error: connectionError } = await admin
    .from("whatsapp_conexoes")
    .update({
      history_sync_status: progress === 100 ? "completed" : "receiving",
      history_sync_progress: boundedProgress,
      last_health_check_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);
  if (connectionError) throw connectionError;

  await mirrorLegacyConnectionState(admin, connectionId, {
    wa_history_sync_status: progress === 100 ? "completed" : "receiving",
    wa_history_sync_progress: boundedProgress,
    wa_last_health_check_at: new Date().toISOString(),
  });
};

const processWebhookPayload = async (
  admin: any,
  payload: any,
  eventId: string,
  connectionId: string,
) => {
  try {
    const flowTasks: FlowTask[] = [];
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        const field = String(change?.field || "");
        const value = change?.value || {};

        if (field === "account_update") {
          await processAccountUpdate(admin, entry?.id, value);
          continue;
        }

        const contactsByWaId = new Map(
          (value.contacts || []).map((
            contact: any,
          ) => [String(contact.wa_id || ""), contact]),
        );

        if (field === "messages") {
          for (const message of value.messages || []) {
            const task = await processMessage(
              admin,
              message,
              contactsByWaId.get(String(message?.from || "")),
              connectionId,
            );
            if (task) flowTasks.push(task);
          }
          for (const status of value.statuses || []) {
            await processStatus(admin, status);
          }
        }

        if (field === "smb_message_echoes" || field === "history") {
          for (const echo of value.message_echoes || []) {
            await processMessageEcho(admin, echo, connectionId);
          }
        }

        if (field === "history") {
          for (const message of value.messages || []) {
            await processHistoryMessage(admin, {
              threadId: message?.from,
              message,
              businessPhone: value?.metadata?.display_phone_number,
              connectionId,
            });
          }
          for (const historyChunk of value.history || []) {
            await processHistoryChunk(
              admin,
              value,
              historyChunk,
              connectionId,
            );
          }
        }

        if (field === "smb_app_state_sync") {
          await processStateSync(admin, value, connectionId);
        }
      }
    }

    const { error: processedError } = await admin
      .from("whatsapp_webhook_events")
      .update({
        processed: true,
        error: null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventId);
    if (processedError) throw processedError;

    await scheduleFlowTasks(flowTasks);
  } catch (error) {
    await admin
      .from("whatsapp_webhook_events")
      .update({
        error: error instanceof Error
          ? error.message
          : "Erro inesperado no webhook WhatsApp.",
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventId);
    console.error("whatsapp-webhook processing error:", error);
  }
};

const hashPayload = async (rawBody: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawBody),
  );
  return `sha256:${hexFromBuffer(digest)}`;
};

const schedulePayloadProcessing = (
  admin: any,
  payload: any,
  eventId: string,
  connectionId: string,
) => {
  const processing = processWebhookPayload(
    admin,
    payload,
    eventId,
    connectionId,
  );
  const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
  if (typeof waitUntil === "function") {
    waitUntil(processing);
    return Promise.resolve();
  }
  return processing;
};

Deno.serve(async (req: Request) => {
  try {
    const admin = createAdmin();

    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      const matchedConnection = token
        ? await verifyTokenMatchesConnection(admin, token)
        : null;

      if (
        mode === "subscribe" &&
        challenge &&
        matchedConnection
      ) {
        const verifiedAt = new Date().toISOString();
        const { error: verificationError } = await admin
          .from("whatsapp_conexoes")
          .update({
            webhook_verified_at: verifiedAt,
            last_health_check_at: verifiedAt,
            last_error: null,
            updated_at: verifiedAt,
          })
          .eq("id", matchedConnection.id);
        if (verificationError) throw verificationError;

        if (matchedConnection.is_matriz_financeira) {
          await admin
            .from("mensageria_config")
            .update({ wa_last_health_check_at: verifiedAt })
            .eq("tipo", "whatsapp");
        }
        return text(challenge);
      }
      return text("Token de verificacao invalido.", 403);
    }

    if (req.method !== "POST") {
      return json({ error: "Metodo nao permitido." }, 405);
    }

    const rawBody = await req.text();
    const payload = JSON.parse(rawBody || "{}");
    const connection = await validatePayloadSource(admin, payload);
    await validateSignature(admin, connection.id, req, rawBody);

    const eventKey = await hashPayload(rawBody);
    const { data: duplicateEvent, error: duplicateError } = await admin
      .from("whatsapp_webhook_events")
      .select(
        "id, processed, error, processing_started_at, processing_attempts",
      )
      .eq("event_key", eventKey)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicateEvent) {
      if (duplicateEvent.processed) {
        return json({ received: true, duplicate: true });
      }

      const startedAt = duplicateEvent.processing_started_at
        ? new Date(duplicateEvent.processing_started_at).getTime()
        : 0;
      const hasActiveLease = !duplicateEvent.error &&
        Number.isFinite(startedAt) &&
        Date.now() - startedAt < 5 * 60 * 1000;
      if (hasActiveLease) {
        return json({ received: true, duplicate: true, processing: true });
      }

      const { error: retryError } = await admin
        .from("whatsapp_webhook_events")
        .update({
          error: null,
          processing_started_at: new Date().toISOString(),
          processing_attempts: Number(duplicateEvent.processing_attempts || 0) +
            1,
        })
        .eq("id", duplicateEvent.id);
      if (retryError) throw retryError;

      await schedulePayloadProcessing(
        admin,
        payload,
        duplicateEvent.id,
        connection.id,
      );
      return json({ received: true, retried: true });
    }

    const firstChange = payload?.entry?.[0]?.changes?.[0];
    const { data: eventRow, error: eventError } = await admin
      .from("whatsapp_webhook_events")
      .insert({
        event_key: eventKey,
        field: firstChange?.field || null,
        payload,
        processing_started_at: new Date().toISOString(),
        processing_attempts: 1,
      })
      .select("id")
      .single();
    if (eventError?.code === "23505") {
      return json({ received: true, duplicate: true });
    }
    if (eventError) throw eventError;

    await schedulePayloadProcessing(
      admin,
      payload,
      eventRow.id,
      connection.id,
    );

    return json({ received: true });
  } catch (error) {
    console.error("whatsapp-webhook error:", error);
    return json({
      error: error instanceof Error
        ? error.message
        : "Erro inesperado no webhook WhatsApp.",
    }, 400);
  }
});
