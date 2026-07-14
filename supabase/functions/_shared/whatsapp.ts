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

export const findAlunoByPhoneAndCpf = async (admin: any, phone: string, cpf: string) => {
  const normalized = normalizeWhatsAppPhone(phone);
  const normalizedCpf = String(cpf || "").replace(/\D/g, "");
  if (!normalized || normalizedCpf.length !== 11) return null;

  const { data, error } = await admin.rpc("whatsapp_find_aluno_by_phone_and_cpf", {
    p_phone: normalized,
    p_cpf: normalizedCpf,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
};

export const phoneBelongsToAluno = async (admin: any, alunoId: string, phone: string) => {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!alunoId || !normalized) return false;

  const { data, error } = await admin.rpc("whatsapp_phone_belongs_to_aluno", {
    p_aluno_id: alunoId,
    p_phone: normalized,
  });
  if (error) throw error;
  return data === true;
};

export const upsertWhatsAppConversation = async (
  admin: any,
  input: {
    phone: string;
    aluno?: any | null;
    contactName?: string | null;
    lastText?: string | null;
    direction?: "entrada" | "saida";
    incrementUnread?: boolean;
    lastAt?: string | null;
  },
) => {
  const phone = normalizeWhatsAppPhone(input.phone);
  if (!phone) throw new Error("Telefone WhatsApp invalido.");

  const contactName = String(
    input.aluno?.nome || input.contactName || phone,
  ).trim();
  const lastText = String(input.lastText || "").trim();
  const now = new Date().toISOString();
  const eventAt = input.lastAt && !Number.isNaN(Date.parse(input.lastAt))
    ? new Date(input.lastAt).toISOString()
    : now;
  const shouldIncrementUnread = input.direction === "entrada" && input.incrementUnread !== false;

  const { data: existing, error: existingError } = await admin
    .from("whatsapp_conversas")
    .select("*")
    .eq("telefone", phone)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const existingLastAt = String(existing.ultima_data || "");
    const isNewerPreview = Date.parse(eventAt) >= Date.parse(existingLastAt || "1970-01-01T00:00:00.000Z");
    const nextLastAt = isNewerPreview
      ? eventAt
      : existing.ultima_data;
    const { data, error } = await admin
      .from("whatsapp_conversas")
      .update({
        aluno_id: input.aluno?.id || existing.aluno_id || null,
        contato_nome: contactName,
        ultimo_texto: isNewerPreview ? lastText || existing.ultimo_texto : existing.ultimo_texto,
        ultima_data: nextLastAt,
        unread_count: shouldIncrementUnread
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
      ultima_data: eventAt,
      unread_count: shouldIncrementUnread ? 1 : 0,
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
    createdAt?: string | null;
  },
) => {
  const createdAt = input.createdAt && !Number.isNaN(Date.parse(input.createdAt))
    ? new Date(input.createdAt).toISOString()
    : null;
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
    ...(createdAt ? { created_at: createdAt } : {}),
  };

  const { data, error } = await admin
    .from("whatsapp_mensagens")
    .upsert(payload, { onConflict: "meta_message_id", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
};
