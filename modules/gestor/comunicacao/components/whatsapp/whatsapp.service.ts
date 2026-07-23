import { supabase } from '../../../../../lib/supabase';
import { normalizePhone } from './whatsapp.utils';
import { WhatsAppBusinessProfile, WhatsAppContact, WhatsAppConversation, WhatsAppFlowSession, WhatsAppFlowSettings, WhatsAppMediaFile, WhatsAppMediaKind, WhatsAppMessage, WhatsAppUsageSummary } from './whatsapp.types';

export const DEFAULT_WHATSAPP_FLOW_SETTINGS: WhatsAppFlowSettings = {
  enabled: false,
  max_attempts: 2,
  auto_close_enabled: true,
  auto_close_hours: 24,
  welcome_message: 'Para proteger seus dados e localizar seu cadastro com segurança, informe seu CPF. Pode enviar com ou sem pontuação.',
  invalid_cpf_message: 'Não consegui validar esse CPF. Envie novamente apenas os 11 números, ou no formato 000.000.000-00.',
  mismatch_message: 'Por segurança, não consegui confirmar esse CPF com o telefone desta conversa. Vou encaminhar seu atendimento para nossa equipe conferir.',
  menu_message: '🎓Olá! Eu sou a Uni.\n\nSou a assistente virtual da Universo Cursos e Consultoria e estou aqui para ajudar.\nEscolha uma das opções abaixo:\n1️⃣ Boleto ou link de pagamento;\n2️⃣ PIX Copia e Cola;\n3️⃣ Declaração para IRPF;\n4️⃣ Falar com um atendente.',
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

const getFunctionErrorMessage = async (error: any, fallback: string) => {
  let detail = error?.message || fallback;
  const context = error?.context;
  if (context && typeof context.json === 'function') {
    const payload = await context.json().catch(() => null);
    detail = payload?.error || detail;
  }
  return detail;
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
    if (error) throw new Error(await getFunctionErrorMessage(error, 'Não foi possível carregar o perfil na Meta.'));
    if ((data as any)?.error) throw new Error((data as any).error);
    return (data as any)?.profile || null;
  },

  async saveBusinessProfile(input: { profile: WhatsAppBusinessProfile; photo?: { base64: string; type: string; name: string } | null }) {
    const { data, error } = await supabase.functions.invoke('whatsapp-profile', {
      body: { action: 'save', ...input },
    });
    if (error) throw new Error(await getFunctionErrorMessage(error, 'Não foi possível salvar o perfil na Meta.'));
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
      throw new Error(await getFunctionErrorMessage(error, 'Não foi possível enviar a mensagem.'));
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

  async closeConversation(conversationId: string) {
    const now = new Date().toISOString();
    const { error: conversationError } = await supabase
      .from('whatsapp_conversas')
      .update({ status: 'arquivada', unread_count: 0, closed_at: now, closed_reason: 'manual' })
      .eq('id', conversationId);
    if (conversationError) throw conversationError;

    const { error: sessionError } = await supabase
      .from('whatsapp_flow_sessions')
      .update({ status: 'closed', handoff_required: false, updated_at: now })
      .eq('conversa_id', conversationId);
    if (sessionError) throw sessionError;
  },

  async reopenConversation(conversationId: string) {
    const { error: conversationError } = await supabase
      .from('whatsapp_conversas')
      .update({ status: 'aberta', closed_at: null, closed_reason: null })
      .eq('id', conversationId);
    if (conversationError) throw conversationError;

    const { error: sessionError } = await supabase
      .from('whatsapp_flow_sessions')
      .delete()
      .eq('conversa_id', conversationId);
    if (sessionError) throw sessionError;
  },

  async getConexoes(): Promise<any[]> {
    const { data, error } = await supabase
      .from('whatsapp_conexoes')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async saveConexao(input: any): Promise<any> {
    const payload = {
      ...input,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('whatsapp_conexoes')
      .upsert(payload)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async transferConversation(input: {
    conversationId: string;
    setor?: string;
    poloId?: string;
    atendenteId?: string;
    gestorNome: string;
    motivo?: string;
  }) {
    const { conversationId, setor, poloId, atendenteId, gestorNome, motivo } = input;
    const updates: any = {
      updated_at: new Date().toISOString(),
      status_atendimento: 'pendente_setor',
    };
    if (setor) updates.setor = setor;
    if (poloId !== undefined) updates.polo_id = poloId;
    if (atendenteId !== undefined) {
      updates.atendente_id = atendenteId;
      if (atendenteId) updates.status_atendimento = 'em_atendimento';
    }

    const { error: chatErr } = await supabase
      .from('whatsapp_conversas')
      .update(updates)
      .eq('id', conversationId);

    if (chatErr) throw chatErr;

    const logDesc = [
      setor ? `setor: ${setor}` : null,
      poloId ? `polo alterado` : null,
      atendenteId ? `atendente atribuído` : null,
      motivo ? `motivo: "${motivo}"` : null,
    ]
      .filter(Boolean)
      .join(', ');

    await supabase.from('whatsapp_mensagens').insert({
      conversa_id: conversationId,
      remetente_tipo: 'sistema',
      remetente_nome: 'Sistema',
      conteudo: `🔄 Atendimento transferido por ${gestorNome} (${logDesc || 'novo direcionamento'}).`,
      direcao: 'saida',
    });
  },

  async updateTicketStatus(input: {
    conversationId: string;
    status: string;
    csatScore?: number;
    csatComentario?: string;
  }) {
    const { conversationId, status, csatScore, csatComentario } = input;
    const now = new Date().toISOString();

    const payload: any = {
      status_atendimento: status,
      updated_at: now,
    };

    if (status === 'em_atendimento') {
      payload.data_inicio_atendimento = now;
    } else if (status === 'solucionada' || status === 'aguardando_avaliacao') {
      payload.data_fim_atendimento = now;
    }

    if (csatScore !== undefined) payload.csat_score = csatScore;
    if (csatComentario !== undefined) payload.csat_comentario = csatComentario;

    const { error } = await supabase
      .from('whatsapp_conversas')
      .update(payload)
      .eq('id', conversationId);

    if (error) throw error;
  },

  async getMetricsSummary(): Promise<any> {
    const { data: rows, error } = await supabase
      .from('whatsapp_conversas')
      .select('id, status_atendimento, tempo_primeira_resposta_seg, tempo_total_atendimento_seg, csat_score');

    if (error) throw error;
    const conversations = rows || [];

    const totalConversations = conversations.length;
    const pendingCount = conversations.filter((c: any) => c.status_atendimento === 'pendente_setor').length;
    const inServiceCount = conversations.filter((c: any) => c.status_atendimento === 'em_atendimento').length;
    const redirectedCount = conversations.filter((c: any) => c.status_atendimento === 'redirecionado_externo').length;
    const solvedCount = conversations.filter((c: any) => c.status_atendimento === 'solucionada').length;

    const firstResponseTimes = conversations.map((c: any) => c.tempo_primeira_resposta_seg).filter((t: any) => typeof t === 'number' && t > 0);
    const totalServiceTimes = conversations.map((c: any) => c.tempo_total_atendimento_seg).filter((t: any) => typeof t === 'number' && t > 0);
    const csats = conversations.map((c: any) => c.csat_score).filter((s: any) => typeof s === 'number' && s > 0);

    const avgFirstResponseSeconds = firstResponseTimes.length ? Math.round(firstResponseTimes.reduce((a: number, b: number) => a + b, 0) / firstResponseTimes.length) : 0;
    const avgTotalServiceSeconds = totalServiceTimes.length ? Math.round(totalServiceTimes.reduce((a: number, b: number) => a + b, 0) / totalServiceTimes.length) : 0;
    const averageCsat = csats.length ? Number((csats.reduce((a: number, b: number) => a + b, 0) / csats.length).toFixed(1)) : 0;

    return {
      totalConversations,
      pendingCount,
      inServiceCount,
      redirectedCount,
      solvedCount,
      avgFirstResponseSeconds,
      avgTotalServiceSeconds,
      averageCsat,
      csatCount: csats.length,
    };
  },
};

