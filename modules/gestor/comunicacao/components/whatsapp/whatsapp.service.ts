import { supabase } from '../../../../../lib/supabase';
import { normalizePhone } from './whatsapp.utils';
import { WhatsAppContact, WhatsAppConversation, WhatsAppMessage, WhatsAppUsageSummary } from './whatsapp.types';

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
    return data || [];
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
};
