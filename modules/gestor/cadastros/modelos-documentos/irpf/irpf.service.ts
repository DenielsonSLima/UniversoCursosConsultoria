// File: modules/gestor/cadastros/modelos-documentos/irpf/irpf.service.ts
// REGRA ABSOLUTA: ZERO localStorage. Supabase é a única fonte de dados.

import { supabase } from '../../../../../lib/supabase';

const DEFAULT_QR_CONFIG = {
  pattern: ['{POLO_ID}', '{ALUNO_MATRICULA}', '{ANO_ATUAL}'],
  separator: '-'
};

const defaultTemplate = {
  textContent: `<p>Declaramos para fins de comprovação de rendimentos no Imposto de Renda que o(a) estudante <b>{{ALUNO_NOME}}</b>, inscrito(a) no CPF sob o nº {{ALUNO_CPF}} e registro acadêmico nº {{ALUNO_MATRICULA}}, regularmente matriculado(a) no curso de <b>{{CURSO_NOME}}</b>, efetuou nesta instituição de ensino no ano-calendário <b>{{ANO_CALENDARIO}}</b> o pagamento de encargos educacionais e mensalidades escolares no valor total de R$ <b>{{VALOR_TOTAL}}</b> ({{VALOR_EXTENSO}}).</p>`,
  absoluteFields: [
    {
      id: 'data_field',
      type: 'text',
      value: '{{CIDADE_POLO}}, {{DATA_ATUAL}}',
      x: 400,
      y: 800,
      width: 350,
      style: { textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }
    },
    {
      id: 'sig_line',
      type: 'text',
      value: '___________________________________________',
      x: 200,
      y: 880,
      width: 394,
      style: { textAlign: 'center', fontSize: '14px' }
    },
    {
      id: 'sig_title',
      type: 'text',
      value: 'Diretoria Acadêmica',
      x: 200,
      y: 910,
      width: 394,
      style: { textAlign: 'center', fontWeight: 'bold', fontSize: '14px', textTransform: 'uppercase' }
    },
    {
      id: 'sig_sub',
      type: 'text',
      value: '{{POLO_NOME}}',
      x: 200,
      y: 935,
      width: 394,
      style: { textAlign: 'center', fontSize: '12px', color: '#475569' }
    },
    {
      id: 'footer_url',
      type: 'text',
      value: 'Para verificar a autenticidade deste documento acesse: www.universocc.com.br/#/validador',
      x: 50,
      y: 1015,
      width: 694,
      style: { textAlign: 'center', fontSize: '9px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }
    }
  ],
  liberacaoDate: '03-01',
  v: 2
};

export const irpfService = {
  async getTemplate(poloId: string) {
    try {
      const { data, error } = await supabase
        .from('documentos_templates')
        .select('conteudo')
        .eq('id', `irpf_${poloId}`)
        .maybeSingle();

      if (!error && data && data.conteudo) {
        return data.conteudo;
      }
    } catch (e) {
      console.error(`[irpfService] Erro ao buscar template irpf_${poloId}:`, e);
    }

    return JSON.parse(JSON.stringify(defaultTemplate));
  },

  async saveTemplate(poloId: string, data: any) {
    try {
      const { error } = await supabase
        .from('documentos_templates')
        .upsert({
          id: `irpf_${poloId}`,
          conteudo: data,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return true;
    } catch (e) {
      console.error(`[irpfService] Erro ao salvar template irpf_${poloId}:`, e);
      return false;
    }
  },

  async getQrConfig() {
    try {
      const { data, error } = await supabase
        .from('documentos_templates')
        .select('conteudo')
        .eq('id', 'irpf_qr_config')
        .maybeSingle();

      if (!error && data && data.conteudo) {
        return data.conteudo;
      }
    } catch (e) {
      console.error('[irpfService] Erro ao buscar QR config:', e);
    }

    return DEFAULT_QR_CONFIG;
  },

  async saveQrConfig(config: any) {
    try {
      const { error } = await supabase
        .from('documentos_templates')
        .upsert({
          id: 'irpf_qr_config',
          conteudo: config,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('[irpfService] Erro ao salvar QR config:', e);
      return false;
    }
  }
};
