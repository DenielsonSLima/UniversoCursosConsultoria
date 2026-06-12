import { supabase } from '../../../../lib/supabase';

export interface MensageriaConfigData {
  id?: string;
  tipo: 'whatsapp' | 'email';
  waProvider?: string;
  waInstanceName?: string;
  waInstanceUrl?: string;
  waToken?: string;
  waStatus?: string;
  smtpServer?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPass?: string;
  smtpSenderName?: string;
  smtpSenderEmail?: string;
}

export interface TemplateMensagem {
  id?: string;
  nome: string;
  gatilho: string;
  conteudo: string;
}

export const mensageriaService = {
  /**
   * Obtém a configuração de mensageria para o tipo especificado ('whatsapp' ou 'email')
   */
  async getConfig(tipo: 'whatsapp' | 'email'): Promise<MensageriaConfigData | null> {
    const { data, error } = await supabase
      .from('mensageria_config')
      .select('*')
      .eq('tipo', tipo)
      .maybeSingle();

    if (error) {
      console.error(`Erro ao buscar config de ${tipo}:`, error);
      throw new Error(error.message);
    }

    if (!data) return null;

    return {
      id: data.id,
      tipo: data.tipo,
      waProvider: data.wa_provider,
      waInstanceName: data.wa_instance_name,
      waInstanceUrl: data.wa_instance_url,
      waToken: data.wa_token,
      waStatus: data.wa_status,
      smtpServer: data.smtp_server,
      smtpPort: data.smtp_port,
      smtpUser: data.smtp_user,
      smtpPass: data.smtp_pass,
      smtpSenderName: data.smtp_sender_name,
      smtpSenderEmail: data.smtp_sender_email
    };
  },

  /**
   * Salva ou atualiza as configurações de mensageria
   */
  async saveConfig(tipo: 'whatsapp' | 'email', config: Partial<MensageriaConfigData>): Promise<boolean> {
    const dbPayload: any = {
      tipo,
      wa_provider: config.waProvider,
      wa_instance_name: config.waInstanceName,
      wa_instance_url: config.waInstanceUrl,
      wa_token: config.waToken,
      wa_status: config.waStatus,
      smtp_server: config.smtpServer,
      smtp_port: config.smtpPort,
      smtp_user: config.smtpUser,
      smtp_pass: config.smtpPass,
      smtp_sender_name: config.smtpSenderName,
      smtp_sender_email: config.smtpSenderEmail
    };

    // Remove campos indefinidos
    Object.keys(dbPayload).forEach(key => {
      if (dbPayload[key] === undefined) delete dbPayload[key];
    });

    const { error } = await supabase
      .from('mensageria_config')
      .upsert(dbPayload, { onConflict: 'tipo' });

    if (error) {
      console.error(`Erro ao salvar config de ${tipo}:`, error);
      throw new Error(error.message);
    }

    return true;
  },

  /**
   * Retorna todos os templates de mensagens cadastrados
   */
  async getTemplates(): Promise<TemplateMensagem[]> {
    const { data, error } = await supabase
      .from('templates_mensagens')
      .select('*')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar templates de mensagens:', error);
      throw new Error(error.message);
    }

    return data || [];
  },

  /**
   * Cria um novo template de mensagem
   */
  async createTemplate(template: Omit<TemplateMensagem, 'id'>): Promise<TemplateMensagem> {
    const { data, error } = await supabase
      .from('templates_mensagens')
      .insert(template)
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar template:', error);
      throw new Error(error.message);
    }

    return data;
  },

  /**
   * Atualiza um template de mensagem existente
   */
  async updateTemplate(id: string, template: Partial<TemplateMensagem>): Promise<TemplateMensagem> {
    const { data, error } = await supabase
      .from('templates_mensagens')
      .update(template)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar template:', error);
      throw new Error(error.message);
    }

    return data;
  },

  /**
   * Exclui um template de mensagem
   */
  async deleteTemplate(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('templates_mensagens')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao excluir template:', error);
      throw new Error(error.message);
    }

    return true;
  }
};
