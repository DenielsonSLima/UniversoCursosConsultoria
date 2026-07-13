import { supabase } from '../../../../../lib/supabase';
import { normalizePhone } from './whatsapp.utils';
import { WhatsAppBusinessProfile, WhatsAppContact, WhatsAppConversation, WhatsAppFlowSession, WhatsAppFlowSettings, WhatsAppMediaFile, WhatsAppMediaKind, WhatsAppMessage, WhatsAppUsageSummary } from './whatsapp.types';

export const DEFAULT_WHATSAPP_FLOW_SETTINGS: WhatsAppFlowSettings = {
  enabled: false,
  max_attempts: 2,
  welcome_message: 'Olá! Sou o atendimento automático da Universo Cursos. Para proteger seus dados e localizar seu cadastro com segurança, informe seu CPF. Pode enviar com ou sem pontuação.',
  invalid_cpf_message: 'Não consegui validar esse CPF. Envie novamente apenas os 11 números, ou no formato 000.000.000-00.',
  mismatch_message: 'Por segurança, não consegui confirmar esse CPF com o telefone desta conversa. Vou encaminhar seu atendimento para nossa equipe conferir.',
  menu_message: 'Cadastro confirmado, {{nome_aluno}}. Como posso ajudar?\n\n1 - Receber link/boleto de pagamento\n2 - Receber PIX copia e cola\n3 - Solicitar declaração de IRPF\n4 - Falar com atendente',
  receivable_choice_message: 'Encontrei mais de uma parcela disponível. Responda com o número da parcela que deseja pagar:',
  no_receivables_message: 'No momento não encontrei parcela aberta, vencida ou próxima do vencimento com dados de pagamento disponíveis. Vou encaminhar para nossa equipe conferir.',
  fallback_message: 'Desculpe, não consegui entender sua resposta. Escolha uma das opções do menu ou digite 4 para falar com atendente.',
  handoff_message: 'Certo. Vou encaminhar sua conversa para um atendente. Em breve alguém da equipe continuará o atendimento por aqui.',
  link_intro_message: 'Claro. Segue o link de pagamento da parcela selecionada. Se já tiver pago, pode desconsiderar.',
  pix_intro_message: 'Claro. Segue o PIX copia e cola da parcela selecionada. Vou enviar separado para facilitar a cópia.',
  irpf_not_eligible_message: 'Não localizei vínculo em curso técnico para liberar a declaração de IRPF automaticamente por aqui. Vou encaminhar para nossa equipe conferir com cuidado.',
  irpf_year_choice_message: 'Localizei declaração de IRPF disponível em mais de um ano-calendário. Responda com o número do ano que deseja receber:',
  irpf_no_years_message: 'Localizei seu vínculo em curso técnico, mas não encontrei pagamentos quitados com ano disponível para IRPF. Vou encaminhar para nossa equipe conferir.',
  irpf_ready_message: 'Encontrei sua declaração de IRPF. Vou enviar o link de validação em uma mensagem separada.',
  irpf_link_intro_message: 'Acesse o link abaixo para consultar e validar sua declaração de IRPF:',
};

const flowTextFields: Array<keyof Pick<WhatsAppFlowSettings,
  'welcome_message' |
  'invalid_cpf_message' |
  'mismatch_message' |
  'menu_message' |
  'receivable_choice_message' |
  'no_receivables_message' |
  'fallback_message' |
  'handoff_message' |
  'link_intro_message' |
  'pix_intro_message' |
  'irpf_not_eligible_message' |
  'irpf_year_choice_message' |
  'irpf_no_years_message' |
  'irpf_ready_message' |
  'irpf_link_intro_message'
>> = [
  'welcome_message',
  'invalid_cpf_message',
  'mismatch_message',
  'menu_message',
  'receivable_choice_message',
  'no_receivables_message',
  'fallback_message',
  'handoff_message',
  'link_intro_message',
  'pix_intro_message',
  'irpf_not_eligible_message',
  'irpf_year_choice_message',
  'irpf_no_years_message',
  'irpf_ready_message',
  'irpf_link_intro_message',
];

const normalizeFlowSettings = (settings?: Partial<WhatsAppFlowSettings> | null): WhatsAppFlowSettings => {
  const next = { ...DEFAULT_WHATSAPP_FLOW_SETTINGS, ...(settings || {}) } as WhatsAppFlowSettings;
  flowTextFields.forEach((field) => {
    next[field] = String(next[field] || '').replace(/\\n/g, '\n');
  });
  return next;
};

export const whatsappService = {
  async getContacts(): Promise<WhatsAppContact[]> {
    const { data, error } = await supabase
      .from('parceiros')
      .select('id,nome,tipo,email,telefone,cpf_cnpj,cidade,status,foto_url,polos(nome,cidade,estado)')
      .eq('tipo', 'Aluno')
      .order('nome', { ascending: true });

    if (error) throw error;

    return (data || []).map((row: any) => {
      const polo = Array.isArray(row.polos) ? row.polos[0] : row.polos;
      const poloNome = polo?.nome
        ? [polo.nome, [polo.cidade, polo.estado].filter(Boolean).join('/')]
            .filter(Boolean)
            .join(' - ')
        : '';

      return {
        id: row.id,
        nome: row.nome,
        tipo: row.tipo,
        email: row.email,
        telefone: row.telefone,
        cpfCnpj: row.cpf_cnpj,
        cidade: row.cidade,
        status: row.status,
        foto: row.foto_url,
        poloNome,
      };
    });
  },

  async getConversations(): Promise<WhatsAppConversation[]> {
    const { data, error } = await supabase
      .from('whatsapp_conversas')
      .select('*')
      .order('ultima_data', { ascending: false });

    if (error) throw error;
    const rows = data || [];
    const alunoIds = [...new Set(rows.map((row: any) => row.aluno_id).filter(Boolean))];
    const { data: alunos } = alunoIds.length
      ? await supabase.from('parceiros').select('id,nome,foto_url').in('id', alunoIds)
      : { data: [] };
    const alunosById = new Map((alunos || []).map((aluno: any) => [aluno.id, aluno]));

    return rows.map((row: any) => {
      const aluno = alunosById.get(row.aluno_id);
      return {
        id: row.id,
        aluno_id: row.aluno_id,
        contato_nome: row.contato_nome || aluno?.nome || row.telefone,
        contato_foto: aluno?.foto_url || null,
        telefone: row.telefone,
        status: row.status,
        ultimo_texto: row.ultimo_texto,
        ultima_data: row.ultima_data,
        unread_count: row.unread_count || 0,
      };
    });
  },

  async getMessages(conversationId?: string | null): Promise<WhatsAppMessage[]> {
    if (!conversationId) return [];

    const { data, error } = await supabase
      .from('whatsapp_mensagens')
      .select('*')
      .eq('conversa_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getUsageSummary(): Promise<WhatsAppUsageSummary | null> {
    const { data, error } = await supabase.rpc('whatsapp_usage_summary');

    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return row || null;
  },

  async getBusinessProfile(): Promise<WhatsAppBusinessProfile | null> {
    const { data, error } = await supabase.functions.invoke('whatsapp-profile', {
      body: { action: 'get' },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return (data as any)?.profile || null;
  },

  async saveBusinessProfile(input: { profile: WhatsAppBusinessProfile; photo?: { base64: string; type: string; name: string } | null }) {
    const { data, error } = await supabase.functions.invoke('whatsapp-profile', {
      body: { action: 'save', ...input },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return (data as any)?.profile || null;
  },

  async markConversationRead(conversationId: string) {
    await supabase
      .from('whatsapp_conversas')
      .update({ unread_count: 0 })
      .eq('id', conversationId);

    await supabase
      .from('whatsapp_mensagens')
      .update({ lida: true })
      .eq('conversa_id', conversationId)
      .eq('direcao', 'entrada')
      .eq('lida', false);
  },

  async deleteConversations(conversationIds: string[]) {
    if (conversationIds.length === 0) return;

    const { error } = await supabase
      .from('whatsapp_conversas')
      .delete()
      .in('id', conversationIds);

    if (error) throw error;
  },

  async sendMessage(input: { alunoId: string; to: string; message: string }) {
    const { data, error } = await supabase.functions.invoke('whatsapp-send', {
      body: {
        alunoId: input.alunoId,
        to: normalizePhone(input.to),
        message: input.message,
      },
    });

    if (error) {
      let detail = error.message;
      const context = (error as any)?.context;
      if (context && typeof context.json === 'function') {
        const payload = await context.json().catch(() => null);
        detail = payload?.error || detail;
      }
      throw new Error(detail);
    }
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  },

  async sendMediaMessage(input: { alunoId: string; to: string; kind: WhatsAppMediaKind; file: WhatsAppMediaFile; caption?: string }) {
    const { data, error } = await supabase.functions.invoke('whatsapp-media', {
      body: { action: 'send', ...input, to: normalizePhone(input.to) },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  },

  async downloadMessageMedia(messageId: string): Promise<{ base64: string; mime: string; filename: string }> {
    const { data, error } = await supabase.functions.invoke('whatsapp-media', {
      body: { action: 'download', messageId },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return (data as any).media;
  },

  async transcribeMessageAudio(messageId: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('whatsapp-media', {
      body: { action: 'transcribe', messageId },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return String((data as any)?.transcription || '');
  },

  async getFlowSettings(): Promise<WhatsAppFlowSettings> {
    const { data, error } = await supabase
      .from('whatsapp_flow_settings')
      .select('*')
      .eq('scope', 'default')
      .maybeSingle();
    if (error) throw error;
    return normalizeFlowSettings(data);
  },

  async saveFlowSettings(settings: WhatsAppFlowSettings): Promise<WhatsAppFlowSettings> {
    const normalized = normalizeFlowSettings(settings);
    const payload = {
      ...normalized,
      id: settings.id,
      scope: 'default',
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('whatsapp_flow_settings')
      .upsert(payload, { onConflict: 'scope' })
      .select('*')
      .single();
    if (error) throw error;
    return normalizeFlowSettings(data);
  },

  async getFlowSessions(): Promise<WhatsAppFlowSession[]> {
    const { data, error } = await supabase
      .from('whatsapp_flow_sessions')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const rows = data || [];
    const conversaIds = [...new Set(rows.map((row: any) => row.conversa_id).filter(Boolean))];
    const alunoIds = [...new Set(rows.map((row: any) => row.aluno_id).filter(Boolean))];
    const [{ data: conversas }, { data: alunos }] = await Promise.all([
      conversaIds.length ? supabase.from('whatsapp_conversas').select('id,contato_nome').in('id', conversaIds) : Promise.resolve({ data: [] as any[] }),
      alunoIds.length ? supabase.from('parceiros').select('id,nome').in('id', alunoIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const conversaMap = new Map((conversas || []).map((row: any) => [row.id, row]));
    const alunoMap = new Map((alunos || []).map((row: any) => [row.id, row]));

    return rows.map((row: any) => ({
      ...row,
      contato_nome: conversaMap.get(row.conversa_id)?.contato_nome,
      aluno_nome: alunoMap.get(row.aluno_id)?.nome,
    }));
  },

  async pauseFlowForConversation(conversationId: string) {
    const { data: conversation, error: conversationError } = await supabase
      .from('whatsapp_conversas')
      .select('id,telefone,aluno_id')
      .eq('id', conversationId)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) throw new Error('Conversa não encontrada.');

    const { error } = await supabase
      .from('whatsapp_flow_sessions')
      .upsert({
        conversa_id: conversation.id,
        telefone: conversation.telefone,
        aluno_id: conversation.aluno_id,
        status: 'handoff',
        handoff_required: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'conversa_id' });
    if (error) throw error;
  },

  async resetFlowForConversation(conversationId: string) {
    const { error } = await supabase
      .from('whatsapp_flow_sessions')
      .delete()
      .eq('conversa_id', conversationId);
    if (error) throw error;
  },
};
