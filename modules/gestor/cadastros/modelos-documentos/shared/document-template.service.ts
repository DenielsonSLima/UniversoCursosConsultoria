import { supabase } from '../../../../../lib/supabase';

export interface DocumentTemplate {
  textContent: string;
  absoluteFields: any[];
  validityDays?: number;
  v?: number;
}

const DEFAULT_QR_CONFIG = {
  pattern: ['{POLO_ID}', '{CURSO_ID}', '{ALUNO_MATRICULA}', '{ANO_ATUAL}'],
  separator: '-'
};

export const createDocumentTemplateService = (
  documentId: string,
  defaultTemplate: DocumentTemplate
) => ({
  async getTemplate(poloId: string): Promise<DocumentTemplate> {
    try {
      const { data, error } = await supabase
        .from('documentos_templates')
        .select('conteudo')
        .eq('id', `${documentId}_${poloId}`)
        .maybeSingle();

      if (!error && data?.conteudo) return data.conteudo;
    } catch (error) {
      console.error(`[${documentId}Service] Erro ao buscar o modelo:`, error);
    }

    return JSON.parse(JSON.stringify(defaultTemplate));
  },

  async saveTemplate(poloId: string, conteudo: DocumentTemplate): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('documentos_templates')
        .upsert({
          id: `${documentId}_${poloId}`,
          conteudo,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error(`[${documentId}Service] Erro ao salvar o modelo:`, error);
      return false;
    }
  },

  async getQrConfig() {
    try {
      const { data, error } = await supabase
        .from('documentos_templates')
        .select('conteudo')
        .eq('id', `${documentId}_qr_config`)
        .maybeSingle();

      if (!error && data?.conteudo) return data.conteudo;
    } catch (error) {
      console.error(`[${documentId}Service] Erro ao buscar configuração do QR Code:`, error);
    }

    return DEFAULT_QR_CONFIG;
  },

  async saveQrConfig(conteudo: any): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('documentos_templates')
        .upsert({
          id: `${documentId}_qr_config`,
          conteudo,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error(`[${documentId}Service] Erro ao salvar configuração do QR Code:`, error);
      return false;
    }
  }
});
