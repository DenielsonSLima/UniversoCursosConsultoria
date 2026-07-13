import {
  insertWhatsAppMessage,
  upsertWhatsAppConversation,
} from "../whatsapp.ts";

const normalizeGraphVersion = (value: unknown) => {
  const version = String(value || "v23.0").trim();
  return /^v\d+\.\d+$/.test(version) ? version : "v23.0";
};

const getMetaConfig = async (admin: any) => {
  const { data: config, error: configError } = await admin
    .from("mensageria_config")
    .select("wa_enabled, wa_status, wa_phone_number_id, wa_graph_version")
    .eq("tipo", "whatsapp")
    .maybeSingle();
  if (configError) throw configError;

  const { data: accessTokenSecret, error: secretError } = await admin.rpc(
    "whatsapp_get_secret",
    { p_secret_name: "whatsapp_meta_access_token" },
  );
  if (secretError) throw secretError;

  const enabled = config?.wa_enabled === true && config?.wa_status === "configurado";
  const accessToken = String(accessTokenSecret || "").trim();
  const phoneNumberId = String(config?.wa_phone_number_id || "").trim();
  if (!enabled || !accessToken || !phoneNumberId) {
    throw new Error("API WhatsApp nao configurada ou token ausente.");
  }

  return {
    accessToken,
    phoneNumberId,
    graphVersion: normalizeGraphVersion(config?.wa_graph_version),
  };
};

export const sendFlowText = async (
  admin: any,
  input: {
    conversation: any;
    aluno?: any | null;
    phone: string;
    text: string;
    previewUrl?: boolean;
  },
) => {
  const text = String(input.text || "").trim();
  if (!text) return null;

  const meta = await getMetaConfig(admin);
  const response = await fetch(
    `https://graph.facebook.com/${meta.graphVersion}/${meta.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${meta.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.phone,
        type: "text",
        text: { preview_url: input.previewUrl === true, body: text },
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Falha ao enviar resposta automatica.");
  }

  const conversation = await upsertWhatsAppConversation(admin, {
    phone: input.phone,
    aluno: input.aluno || null,
    contactName: input.conversation?.contato_nome,
    lastText: text,
    direction: "saida",
  });

  await insertWhatsAppMessage(admin, {
    conversaId: conversation.id,
    alunoId: input.aluno?.id || input.conversation?.aluno_id || null,
    metaMessageId: payload?.messages?.[0]?.id || null,
    direction: "saida",
    senderType: "sistema",
    senderName: "Robô WhatsApp",
    content: text,
    messageType: "text",
    status: "sent",
    rawPayload: payload,
    read: true,
  });

  return payload;
};
