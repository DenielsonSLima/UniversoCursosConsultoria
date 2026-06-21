// File: modules/gestor/cadastros/modelos-documentos/estagio/estagio.service.ts
// REGRA ABSOLUTA: ZERO localStorage. Supabase é a única fonte de dados.

import { supabase } from '../../../../../lib/supabase';

const DEFAULT_QR_CONFIG = {
  pattern: ['{POLO_ID}', '{CURSO_ID}', '{ALUNO_MATRICULA}', '{ANO_ATUAL}'],
  separator: '-'
};

const defaultTemplate = {
  textContent: `<p>Por este instrumento, a Instituição de Ensino <b>{{POLO_NOME}}</b>, a concedente <b>{{CONCEDENTE_NOME}}</b>, CNPJ nº {{CONCEDENTE_CNPJ}}, e o(a) estudante <b>{{ALUNO_NOME}}</b>, CPF nº {{ALUNO_CPF}}, matrícula nº {{ALUNO_MATRICULA}}, do curso <b>{{CURSO_NOME}}</b>, firmam o presente Termo de Compromisso de Estágio.</p><br><p><b>Vigência:</b> {{PERIODO_ESTAGIO}} &nbsp; <b>Jornada:</b> {{JORNADA_ESTAGIO}} &nbsp; <b>Carga horária:</b> {{CARGA_HORARIA_ESTAGIO}}.</p><br><p><b>Plano de atividades:</b> {{PLANO_ATIVIDADES}}</p><br><p>O estágio será acompanhado pela instituição de ensino e supervisionado por <b>{{SUPERVISOR_NOME}}</b>, observadas as condições acadêmicas, de segurança e de avaliação previstas no plano de atividades.</p>`,
  absoluteFields: [
    {
      id: 'data_field',
      type: 'text',
      value: '{{CIDADE_POLO}}, {{DATA_ATUAL}}',
      x: 410,
      y: 800,
      width: 310,
      style: { textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }
    },
    {
      id: 'assinaturas_estagio',
      type: 'text',
      value: '__________________________      __________________________      __________________________\nInstituição de Ensino                    Concedente                              Estudante',
      x: 75,
      y: 900,
      width: 645,
      style: { textAlign: 'center', fontSize: '11px', whiteSpace: 'pre-line' }
    }
  ],
  validityDays: 90,
  v: 2
};

export const estagioService = {
  async getTemplate(poloId: string) {
    try {
      const { data, error } = await supabase
        .from('documentos_templates')
        .select('conteudo')
        .eq('id', `estagio_${poloId}`)
        .maybeSingle();

      if (!error && data && data.conteudo) {
        return data.conteudo;
      }
    } catch (e) {
      console.error(`[estagioService] Erro ao buscar template estagio_${poloId}:`, e);
    }

    return JSON.parse(JSON.stringify(defaultTemplate));
  },

  async saveTemplate(poloId: string, data: any) {
    try {
      const { error } = await supabase
        .from('documentos_templates')
        .upsert({
          id: `estagio_${poloId}`,
          conteudo: data,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return true;
    } catch (e) {
      console.error(`[estagioService] Erro ao salvar template estagio_${poloId}:`, e);
      return false;
    }
  },

  async getQrConfig() {
    try {
      const { data, error } = await supabase
        .from('documentos_templates')
        .select('conteudo')
        .eq('id', 'estagio_qr_config')
        .maybeSingle();

      if (!error && data && data.conteudo) {
        return data.conteudo;
      }
    } catch (e) {
      console.error('[estagioService] Erro ao buscar QR config:', e);
    }

    return DEFAULT_QR_CONFIG;
  },

  async saveQrConfig(config: any) {
    try {
      const { error } = await supabase
        .from('documentos_templates')
        .upsert({
          id: 'estagio_qr_config',
          conteudo: config,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('[estagioService] Erro ao salvar QR config:', e);
      return false;
    }
  }
};
