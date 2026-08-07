import {
  insertWhatsAppMessage,
  upsertWhatsAppConversation,
} from "../whatsapp.ts";
import { getWhatsAppMetaContext } from "../whatsapp-connection.ts";

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

  const connectionId = String(
    input.conversation?.conexao_id || "",
  ).trim();
  if (!connectionId) throw new Error("A conversa não possui uma linha WhatsApp.");
  const meta = await getWhatsAppMetaContext(admin, connectionId);
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
    connectionId,
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
