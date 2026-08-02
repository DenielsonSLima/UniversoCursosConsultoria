// File: modules/gestor/cadastros/modelos-documentos/carteirinha/carteirinha.service.ts
// REGRA ABSOLUTA: ZERO localStorage. Supabase é a única fonte de dados.

import { supabase } from '../../../../../lib/supabase';

export interface CarteirinhaTemplate {
  [key: string]: unknown;
  id?: string;
  nome?: string;
  tipoCurso?: string;
  status?: string;
  hasVerso?: boolean;
  widthCm?: number;
  heightCm?: number;
  startNumber?: number;
  bgFrenteUrl?: string;
  bgVersoUrl?: string;
  fields?: unknown[];
  corPrimaria?: string;
  corSecundaria?: string;
  textoFrente?: string;
  textoVerso?: string;
  ocultarDesignPadrao?: boolean;
}

const DEFAULT_TEMPLATE: CarteirinhaTemplate = {
  widthCm: 8.5,
  heightCm: 5.5,
  startNumber: 1000,
  bgFrenteUrl: '',
  bgVersoUrl: '',
  fields: []
};

const normalizeTemplate = (template: unknown): CarteirinhaTemplate | null => {
  if (!template || typeof template !== 'object' || Array.isArray(template)) return null;

  const source = template as CarteirinhaTemplate;

  return {
    ...source,
    bgFrenteUrl: String(source.bgFrenteUrl || source.bgFrente || source.bg_frente_url || ''),
    bgVersoUrl: String(source.bgVersoUrl || source.bgVerso || source.bg_verso_url || ''),
  };
};

const fetchStoredTemplate = async (): Promise<CarteirinhaTemplate | null> => {
  const { data, error } = await supabase
    .from('documentos_templates')
    .select('conteudo')
    .eq('id', 'carteirinha')
    .maybeSingle();

  if (error) {
    console.error('[carteirinhaService] Erro ao buscar template do Supabase:', error);
    throw error;
  }

  return normalizeTemplate(data?.conteudo);
};

export const carteirinhaService = {
  async getTemplate(): Promise<CarteirinhaTemplate> {
    return (await fetchStoredTemplate()) || DEFAULT_TEMPLATE;
  },

  async getStudentTemplate(): Promise<CarteirinhaTemplate> {
    const template = await fetchStoredTemplate();
    if (!template) {
      throw new Error('O modelo oficial da carteirinha não está disponível para este acesso.');
    }
    return template;
  },

  async saveTemplate(data: CarteirinhaTemplate) {
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
