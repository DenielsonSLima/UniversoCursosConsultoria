export const normalizeWhatsAppPhone = (value: unknown) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
};

export const textFromWhatsAppMessage = (message: any) => {
  const type = String(message?.type || "text");
  if (type === "text") return String(message?.text?.body || "").trim();
  if (type === "button") return String(message?.button?.text || "").trim();
  if (type === "interactive") {
    return String(
      message?.interactive?.button_reply?.title ||
        message?.interactive?.list_reply?.title ||
        "[mensagem interativa]",
    ).trim();
  }
  if (type === "image") return String(message?.image?.caption || "[imagem]");
  if (type === "document") return String(message?.document?.caption || message?.document?.filename || "[documento]");
  if (type === "audio") return "[audio]";
  if (type === "video") return String(message?.video?.caption || "[video]");
  if (type === "sticker") return "[figurinha]";
  if (type === "location") return "[localizacao]";
  if (type === "contacts") return "[contato]";
  return `[${type}]`;
};

export const findAlunoByPhone = async (admin: any, phone: string) => {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return null;

  const { data, error } = await admin
    .rpc("whatsapp_find_aluno_by_phone", { p_phone: normalized });
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
};

export const upsertWhatsAppConversation = async (
  admin: any,
  input: {
    phone: string;
    aluno?: any | null;
    contactName?: string | null;
    lastText?: string | null;
    direction?: "entrada" | "saida";
  },
) => {
  const phone = normalizeWhatsAppPhone(input.phone);
  if (!phone) throw new Error("Telefone WhatsApp invalido.");

  const contactName = String(
    input.aluno?.nome || input.contactName || phone,
  ).trim();
  const lastText = String(input.lastText || "").trim();
  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await admin
    .from("whatsapp_conversas")
    .select("*")
    .eq("telefone", phone)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { data, error } = await admin
      .from("whatsapp_conversas")
      .update({
        aluno_id: input.aluno?.id || existing.aluno_id || null,
        contato_nome: contactName,
        ultimo_texto: lastText || existing.ultimo_texto,
        ultima_data: now,
        unread_count: input.direction === "entrada"
          ? Number(existing.unread_count || 0) + 1
          : Number(existing.unread_count || 0),
        updated_at: now,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await admin
    .from("whatsapp_conversas")
    .insert({
      aluno_id: input.aluno?.id || null,
      contato_nome: contactName,
      telefone: phone,
      ultimo_texto: lastText || null,
      ultima_data: now,
      unread_count: input.direction === "entrada" ? 1 : 0,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
};

export const insertWhatsAppMessage = async (
  admin: any,
  input: {
    conversaId: string;
    alunoId?: string | null;
    metaMessageId?: string | null;
    direction: "entrada" | "saida" | "status";
    senderType: "aluno" | "gestor" | "sistema";
    senderName: string;
    content: string;
    messageType?: string;
    status?: string | null;
    rawPayload?: unknown;
    read?: boolean;
  },
) => {
  const payload = {
    conversa_id: input.conversaId,
    aluno_id: input.alunoId || null,
    meta_message_id: input.metaMessageId || null,
    direcao: input.direction,
    remetente_tipo: input.senderType,
    remetente_nome: input.senderName,
    conteudo: input.content || "",
    message_type: input.messageType || "text",
    status: input.status || null,
    raw_payload: input.rawPayload || {},
    lida: input.read === true,
  };

  const { data, error } = await admin
    .from("whatsapp_mensagens")
    .upsert(payload, { onConflict: "meta_message_id", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
};
