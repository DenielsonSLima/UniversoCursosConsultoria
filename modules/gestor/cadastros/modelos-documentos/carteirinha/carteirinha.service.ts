// File: modules/gestor/cadastros/modelos-documentos/carteirinha/carteirinha.service.ts
// REGRA ABSOLUTA: ZERO localStorage. Supabase é a única fonte de dados.

import { supabase } from '../../../../../lib/supabase';

const DEFAULT_TEMPLATE = {
  widthCm: 8.5,
  heightCm: 5.5,
  startNumber: 1000,
  bgFrenteUrl: '',
  bgVersoUrl: '',
  fields: []
};

const normalizeTemplate = (template: Record<string, any> | null) => {
  if (!template) return null;

  return {
    ...template,
    bgFrenteUrl: template.bgFrenteUrl || template.bgFrente || template.bg_frente_url || '',
    bgVersoUrl: template.bgVersoUrl || template.bgVerso || template.bg_verso_url || '',
  };
};

export const carteirinhaService = {
  async getTemplate() {
    try {
      const { data, error } = await supabase
        .from('documentos_templates')
        .select('conteudo')
        .eq('id', 'carteirinha')
        .maybeSingle();

      if (!error && data && data.conteudo) {
        return normalizeTemplate(data.conteudo);
      }
    } catch (e) {
      console.error('[carteirinhaService] Erro ao buscar template do Supabase:', e);
    }

    return DEFAULT_TEMPLATE;
  },

  async saveTemplate(data: any) {
    try {
      const { error } = await supabase
        .from('documentos_templates')
        .upsert({
          id: 'carteirinha',
          conteudo: data,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('[carteirinhaService] Erro ao salvar template no Supabase:', e);
      return false;
    }
  },

  async getNextNumber() {
    const temp = await this.getTemplate();
    return temp.startNumber || 1000;
  }
};
