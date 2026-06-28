import { supabase } from '../../../../../lib/supabase';
import { defaultTemplate } from '../declaracao/declaracao.service';

const DEFAULT_QR_CONFIG = {
  pattern: ['{POLO_ID}', '{CURSO_ID}', '{ALUNO_MATRICULA}', '{ANO_ATUAL}'],
  separator: '-',
};

export const FREQUENCIA_DEFAULT_TEXT = `<p>Declaramos, para os devidos fins, que o(a) aluno(a) <b>{{ALUNO_NOME}}</b>, portador(a) do CPF nº <b>{{ALUNO_CPF}}</b>, <b>{{ALUNO_DOCUMENTO_TIPO}}</b> nº <b>{{ALUNO_RG}}</b>, registrado(a) sob a matrícula nº <b>{{ALUNO_MATRICULA}}</b>, encontra-se regularmente matriculado(a) no curso de <b>{{CURSO_NOME}}</b>, turma <b>{{TURMA_NOME}}</b>, nesta instituição de ensino.</p><br><p>Declaramos ainda que o(a) referido(a) aluno(a) apresenta frequência regular nas atividades acadêmicas do curso, conforme os registros desta instituição, no polo de <b>{{POLO_NOME}}</b>.</p><br><p>Por ser expressão da verdade, firmamos a presente declaração para os fins que se fizerem necessários.</p>`;

export const frequenciaDefaultTemplate = {
  ...JSON.parse(JSON.stringify(defaultTemplate)),
  textContent: FREQUENCIA_DEFAULT_TEXT,
};

export const declaracaoFrequenciaService = {
  async getTemplate(poloId: string) {
    try {
      const { data, error } = await supabase
        .from('documentos_templates')
        .select('conteudo')
        .eq('id', 'declaracao_frequencia')
        .maybeSingle();

      if (!error && data?.conteudo) return data.conteudo;

      if (poloId) {
        const { data: legacyData, error: legacyError } = await supabase
          .from('documentos_templates')
          .select('conteudo')
          .eq('id', `declaracao_frequencia_${poloId}`)
          .maybeSingle();

        if (!legacyError && legacyData?.conteudo) return legacyData.conteudo;
      }
    } catch (error) {
      console.error('[declaracaoFrequenciaService] Erro ao buscar template compartilhado:', error);
    }

    return JSON.parse(JSON.stringify(frequenciaDefaultTemplate));
  },

  async saveTemplate(poloId: string, conteudo: any) {
    try {
      const { error } = await supabase
        .from('documentos_templates')
        .upsert({
          id: 'declaracao_frequencia',
          conteudo,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('[declaracaoFrequenciaService] Erro ao salvar template compartilhado:', error);
      return false;
    }
  },

  async getQrConfig() {
    try {
      const { data, error } = await supabase
        .from('documentos_templates')
        .select('conteudo')
        .eq('id', 'declaracao_frequencia_qr_config')
        .maybeSingle();

      if (!error && data?.conteudo) return data.conteudo;
    } catch (error) {
      console.error('[declaracaoFrequenciaService] Erro ao buscar configuração do QR Code:', error);
    }

    return DEFAULT_QR_CONFIG;
  },

  async saveQrConfig(conteudo: any) {
    try {
      const { error } = await supabase
        .from('documentos_templates')
        .upsert({
          id: 'declaracao_frequencia_qr_config',
          conteudo,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('[declaracaoFrequenciaService] Erro ao salvar configuração do QR Code:', error);
      return false;
    }
  },
};
