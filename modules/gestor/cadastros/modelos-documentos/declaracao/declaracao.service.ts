// File: modules/gestor/cadastros/modelos-documentos/declaracao/declaracao.service.ts
// REGRA ABSOLUTA: ZERO localStorage. Supabase é a única fonte de dados.

import { supabase } from '../../../../../lib/supabase';

const DEFAULT_QR_CONFIG = {
  pattern: ['{POLO_ID}', '{CURSO_ID}', '{ALUNO_MATRICULA}', '{ANO_ATUAL}'],
  separator: '-'
};

export const defaultTemplate = {
  textContent: `<p>Declaramos para os devidos fins que o(a) aluno(a) <b>{{ALUNO_NOME}}</b>, portador(a) do CPF nº <b>{{ALUNO_CPF}}</b>, <b>{{ALUNO_DOCUMENTO_TIPO}}</b> nº <b>{{ALUNO_RG}}</b>, nascido(a) em <b>{{ALUNO_NASCIMENTO}}</b>, registrado(a) sob a matrícula nº <b>{{ALUNO_MATRICULA}}</b>, encontra-se regularmente matriculado(a) no curso de <b>{{CURSO_NOME}}</b>, na turma <b>{{TURMA_NOME}}</b>, nesta instituição de ensino.</p><br><p>O referido curso é realizado na modalidade presencial no polo de <b>{{POLO_NOME}}</b>.</p><br><p>Atestamos que o aluno apresenta frequência regular e está em dia com suas obrigações acadêmicas.</p>`,
  absoluteFields: [
    {
      id: 'data_field',
      type: 'text',
      value: '{{CIDADE_POLO}}, {{DATA_ATUAL}}',
      x: 400,
      y: 780,
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
      value: 'Secretaria Acadêmica',
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
      id: 'footer_valid_until',
      type: 'text',
      value: 'ESTE DOCUMENTO É VÁLIDO ATÉ <span style="color: #ef4444">{{VALIDADE_DATA}}</span>.',
      x: 50,
      y: 975,
      width: 694,
      style: { textAlign: 'center', fontSize: '9px', color: '#000000', fontWeight: 'bold', textTransform: 'uppercase' }
    },
    {
      id: 'footer_url',
      type: 'text',
      value: 'Para verificar a autenticidade deste documento acesse: <span style="color: #ef4444">www.universocc.com.br/validador</span>',
      x: 50,
      y: 995,
      width: 694,
      style: { textAlign: 'center', fontSize: '9px', color: '#000000', fontWeight: 'bold', textTransform: 'uppercase' }
    },
    {
      id: 'footer_validity',
      type: 'text',
      value: 'Validade deste documento: <span style="color: #ef4444">{{VALIDADE_DIAS}} dias a partir da data de emissão</span>.',
      x: 50,
      y: 1015,
      width: 694,
      style: { textAlign: 'center', fontSize: '9px', color: '#000000', fontWeight: 'bold', textTransform: 'uppercase' }
    },
    {
      id: 'footer_generation',
      type: 'text',
      value: 'DOCUMENTO GERADO EM: {{DATA_GERACAO}}',
      x: 50,
      y: 1035,
      width: 694,
      style: { textAlign: 'center', fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase' }
    }
  ],
  validityDays: 30,
  v: 2
};

export const declaracaoService = {
  async getTemplate(poloId: string) {
    try {
      const { data, error } = await supabase
        .from('documentos_templates')
        .select('conteudo')
        .eq('id', `declaracao_${poloId}`)
        .maybeSingle();

      if (!error && data && data.conteudo) {
        return data.conteudo;
      }
    } catch (e) {
      console.error(`[declaracaoService] Erro ao buscar template declaracao_${poloId}:`, e);
    }

    return JSON.parse(JSON.stringify(defaultTemplate));
  },

  async saveTemplate(poloId: string, data: any) {
    try {
      const { error } = await supabase
        .from('documentos_templates')
        .upsert({
          id: `declaracao_${poloId}`,
          conteudo: data,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return true;
    } catch (e) {
      console.error(`[declaracaoService] Erro ao salvar template declaracao_${poloId}:`, e);
      return false;
    }
  },

  async getQrConfig() {
    try {
      const { data, error } = await supabase
        .from('documentos_templates')
        .select('conteudo')
        .eq('id', 'declaracao_qr_config')
        .maybeSingle();

      if (!error && data && data.conteudo) {
        return data.conteudo;
      }
    } catch (e) {
      console.error('[declaracaoService] Erro ao buscar QR config:', e);
    }

    return DEFAULT_QR_CONFIG;
  },

  async saveQrConfig(config: any) {
    try {
      const { error } = await supabase
        .from('documentos_templates')
        .upsert({
          id: 'declaracao_qr_config',
          conteudo: config,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('[declaracaoService] Erro ao salvar QR config:', e);
      return false;
    }
  }
};
