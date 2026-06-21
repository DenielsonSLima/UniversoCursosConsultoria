// File: modules/gestor/cadastros/modelos-documentos/cracha/cracha.service.ts
// REGRA ABSOLUTA: ZERO localStorage. Supabase é a única fonte de dados.

import { supabase } from '../../../../../lib/supabase';

const DEFAULT_TEMPLATE = {
  id: 'cracha',
  nome: 'Crachá de Estágio',
  cargoPadrao: 'ESTAGIÁRIO',
  status: 'ativo',
  startNumber: 1000,
  hasVerso: true,
  corPrimaria: '#0f172a',
  corSecundaria: '#10b981',
  textoFrente: 'ESTAGIÁRIO',
  textoVerso: 'INSTRUÇÕES DE USO:\n1. Este crachá é de uso pessoal, intransferível e obrigatório nas dependências da instituição e no local do estágio.\n2. Mantenha-o sempre visível.\n3. Em caso de perda, comunique imediatamente a Universo Cursos e Consultoria.',
  bgFrenteUrl: '',
  bgVersoUrl: '',
  usePhotoshopLayout: true,
  ocultarDesignPadrao: false,
  corTexto: '#1e293b',
  tamanhoFonteNome: 8.5,
  tamanhoFonteDados: 6.8,
  fotoWidth: 45.0,
  fotoHeight: 28.5,
  fields: [
    {
      id: 'foto',
      type: 'foto',
      value: '{{ALUNO_FOTO}}',
      x: 27.5,
      y: 14,
      width: 45,
      height: 28.5,
      page: 'frente'
    },
    {
      id: 'nome',
      type: 'text',
      value: '{{ALUNO_NOME}}',
      x: 3.7,
      y: 47.0,
      page: 'frente',
      style: { fontWeight: 'bold', fontSize: '9px', textAlign: 'center', color: '#1e293b' }
    },
    {
      id: 'cargo',
      type: 'text',
      value: 'ESTAGIÁRIO',
      x: 3.7,
      y: 53.0,
      page: 'frente',
      style: { fontWeight: 'bold', fontSize: '7.5px', textAlign: 'center', color: '#10b981' }
    },
    {
      id: 'matricula',
      type: 'text',
      value: 'MATRÍCULA: {{ALUNO_MATRICULA}}',
      x: 5.5,
      y: 60.0,
      page: 'frente',
      style: { fontSize: '6.8px', color: '#1e293b' }
    },
    {
      id: 'cpf',
      type: 'text',
      value: 'CPF: {{ALUNO_CPF}}',
      x: 5.5,
      y: 66.2,
      page: 'frente',
      style: { fontSize: '6.8px', color: '#1e293b' }
    },
    {
      id: 'polo',
      type: 'text',
      value: 'POLO: {{POLO_NOME}}',
      x: 5.5,
      y: 72.4,
      page: 'frente',
      style: { fontSize: '6.8px', color: '#1e293b' }
    },
    {
      id: 'qrcode',
      type: 'qrcode',
      value: 'QR_VALIDADOR_CRACHA',
      x: 62.0,
      y: 60.0,
      width: 22,
      height: 14,
      page: 'frente'
    },
    {
      id: 'instrucoes',
      type: 'text',
      value: 'INSTRUÇÕES DE USO:\n1. Este crachá é de uso pessoal, intransferível e obrigatório nas dependências da instituição e no local do estágio.\n2. Mantenha-o sempre visível.\n3. Em caso de perda, comunique imediatamente a Universo Cursos e Consultoria.',
      x: 7.4,
      y: 14.0,
      width: 85.2,
      page: 'verso',
      style: { fontSize: '5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' }
    },
    {
      id: 'admissao_label',
      type: 'text',
      value: 'ADMISSÃO',
      x: 7.4,
      y: 56.0,
      page: 'verso',
      style: { fontSize: '4px', fontWeight: 'bold', color: '#94a3b8' }
    },
    {
      id: 'admissao_valor',
      type: 'text',
      value: '05/01/2024',
      x: 7.4,
      y: 59.0,
      page: 'verso',
      style: { fontSize: '5.8px', fontWeight: 'bold', color: '#475569' }
    },
    {
      id: 'emissao_label',
      type: 'text',
      value: 'EMISSÃO',
      x: 50.0,
      y: 56.0,
      page: 'verso',
      style: { fontSize: '4px', fontWeight: 'bold', color: '#94a3b8' }
    },
    {
      id: 'emissao_valor',
      type: 'text',
      value: '{{DATA_HOJE}}',
      x: 50.0,
      y: 59.0,
      page: 'verso',
      style: { fontSize: '5.8px', fontWeight: 'bold', color: '#475569' }
    },
    {
      id: 'assinatura_linha',
      type: 'text',
      value: '_____________________________________',
      x: 7.4,
      y: 70.0,
      page: 'verso',
      style: { fontSize: '5px', textAlign: 'center', color: '#94a3b8' }
    },
    {
      id: 'assinatura_cargo',
      type: 'text',
      value: 'Diretoria de Recursos Humanos',
      x: 7.4,
      y: 74.0,
      page: 'verso',
      style: { fontSize: '4.5px', fontWeight: 'bold', color: '#94a3b8', textAlign: 'center' }
    },
    {
      id: 'assinatura_instituicao',
      type: 'text',
      value: 'UNIVERSO CURSOS E CONSULTORIA',
      x: 7.4,
      y: 78.0,
      page: 'verso',
      style: { fontSize: '5.5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' }
    }
  ]
};

export const crachaService = {
  async getTemplate() {
    try {
      const { data, error } = await supabase
        .from('documentos_templates')
        .select('conteudo')
        .eq('id', 'cracha')
        .maybeSingle();

      if (!error && data && data.conteudo) {
        return data.conteudo;
      }
    } catch (e) {
      console.error('[crachaService] Erro ao buscar template do Supabase:', e);
    }

    return DEFAULT_TEMPLATE;
  },

  async saveTemplate(data: any) {
    try {
      const { error } = await supabase
        .from('documentos_templates')
        .upsert({
          id: 'cracha',
          conteudo: data,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('[crachaService] Erro ao salvar template no Supabase:', e);
      return false;
    }
  },

  async getNextNumber() {
    const temp = await this.getTemplate();
    return temp.startNumber || 1000;
  }
};
