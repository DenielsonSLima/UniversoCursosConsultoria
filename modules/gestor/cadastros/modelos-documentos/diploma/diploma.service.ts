// File: modules/gestor/cadastros/modelos-documentos/diploma/diploma.service.ts
// REGRA ABSOLUTA: ZERO localStorage. Supabase é a única fonte de dados.

import { supabase } from '../../../../../lib/supabase';

const INITIAL_MODELOS = [
  {
    id: '1',
    nome: 'Diploma - Especialização',
    tipoCurso: 'Cursos Especialização',
    status: 'ativo',
    hasVerso: true,
    hasWatermark: true,
    watermarkText: 'MARCA D\'ÁGUA PADRÃO',
    hasValidationQrCode: true,
    textoFrente: 'A Direção da Instituição, no uso de suas atribuições regimentais, confere o presente certificado a <strong>{{nome_aluno}}</strong>, portador do CPF {{cpf}}, por haver concluído em {{data_conclusao}} o curso de Especialização em <strong>{{curso_nome}}</strong>, com carga horária total de {{carga_horaria}} horas.',
    textoVerso: 'Conteúdo Programático:\n\n{{grade_curricular}}\n\nRegistro Acadêmico:\n{{livro_registro}}',
    layout: 'classic',
    usePhotoshopLayout: false,
    ocultarDesignPadrao: false,
    bgFrenteUrl: '',
    bgVersoUrl: '',
    tamanhoFonteTitulo: 45,
    tamanhoFonteSubtitulo: 14,
    tamanhoFonteTexto: 24,
    tamanhoFonteCidadeData: 12,
    seloWidth: 96,
    qrcodeWidth: 150,
    assinaturaWidth: 256,
    exibirRotulos: true,
    corTexto: '#1e293b',
    corPrimaria: '#001a33',
    corSecundaria: '#e2e8f0',
    exibirLogo: true,
    exibirTitulo: true,
    exibirSubtitulo: true,
    exibirTexto: true,
    exibirCidadeData: true,
    exibirAssinatura1: true,
    exibirAssinatura2: true,
    exibirBorda: true
  },
  {
    id: '2',
    nome: 'Certificado Express - Cursos Livres',
    tipoCurso: 'Cursos Livres',
    status: 'ativo',
    hasVerso: false,
    hasWatermark: false,
    watermarkText: '',
    hasValidationQrCode: true,
    textoFrente: 'Certificamos que {{nome_aluno}} concluiu brilhantemente o curso livre de {{curso_nome}} com carga horária de {{carga_horaria}} horas. Parabéns pelo desempenho!',
    textoVerso: '',
    layout: 'classic',
    usePhotoshopLayout: false,
    ocultarDesignPadrao: false,
    bgFrenteUrl: '',
    bgVersoUrl: '',
    tamanhoFonteTitulo: 45,
    tamanhoFonteSubtitulo: 14,
    tamanhoFonteTexto: 24,
    tamanhoFonteCidadeData: 12,
    seloWidth: 96,
    qrcodeWidth: 150,
    assinaturaWidth: 256,
    exibirRotulos: true,
    corTexto: '#1e293b',
    corPrimaria: '#001a33',
    corSecundaria: '#e2e8f0',
    exibirLogo: true,
    exibirTitulo: true,
    exibirSubtitulo: true,
    exibirTexto: true,
    exibirCidadeData: true,
    exibirAssinatura1: true,
    exibirAssinatura2: true,
    exibirBorda: true
  },
  {
    id: '3',
    nome: 'Diploma - Curso Técnico',
    tipoCurso: 'Cursos Técnicos',
    status: 'ativo',
    hasVerso: true,
    hasWatermark: true,
    watermarkText: 'DOCUMENTO OFICIAL',
    hasValidationQrCode: true,
    textoFrente: 'Certificamos para os devidos fins que <strong>{{nome_aluno}}</strong>, portador do CPF {{cpf}}, concluiu com êxito o curso de formação de Técnico em <strong>{{curso_nome}}</strong>, perfazendo um total de {{carga_horaria}} horas-aula, possuindo as competências profissionais requeridas.',
    textoVerso: 'Grade Curricular do Curso Técnico:\n\n{{grade_curricular}}\n\nRegistro Acadêmico:\n{{livro_registro}}',
    layout: 'classic',
    usePhotoshopLayout: false,
    ocultarDesignPadrao: false,
    bgFrenteUrl: '',
    bgVersoUrl: '',
    tamanhoFonteTitulo: 45,
    tamanhoFonteSubtitulo: 14,
    tamanhoFonteTexto: 24,
    tamanhoFonteCidadeData: 12,
    seloWidth: 96,
    qrcodeWidth: 150,
    assinaturaWidth: 256,
    exibirRotulos: true,
    corTexto: '#1e293b',
    corPrimaria: '#001a33',
    corSecundaria: '#e2e8f0',
    exibirLogo: true,
    exibirTitulo: true,
    exibirSubtitulo: true,
    exibirTexto: true,
    exibirCidadeData: true,
    exibirAssinatura1: true,
    exibirAssinatura2: true,
    exibirBorda: true
  },
  {
    id: '4',
    nome: 'Certificado - EAD',
    tipoCurso: 'Educação a Distância (EAD)',
    status: 'ativo',
    hasVerso: true,
    hasWatermark: true,
    watermarkText: 'EAD INSTITUCIONAL',
    hasValidationQrCode: true,
    textoFrente: 'Confere-se o presente certificado a <strong>{{nome_aluno}}</strong> (CPF: {{cpf}}) por concluir o curso na modalidade de Educação a Distância (EAD) em <strong>{{curso_nome}}</strong>, com carga horária de {{carga_horaria}} horas, em {{data_conclusao}}.',
    textoVerso: 'Atividades e Módulos (EAD):\n\n{{grade_curricular}}\n\nCódigo de Autenticidade:\n{{livro_registro}}',
    layout: 'classic',
    usePhotoshopLayout: false,
    ocultarDesignPadrao: false,
    bgFrenteUrl: '',
    bgVersoUrl: '',
    tamanhoFonteTitulo: 45,
    tamanhoFonteSubtitulo: 14,
    tamanhoFonteTexto: 24,
    tamanhoFonteCidadeData: 12,
    seloWidth: 96,
    qrcodeWidth: 150,
    assinaturaWidth: 256,
    exibirRotulos: true,
    corTexto: '#1e293b',
    corPrimaria: '#001a33',
    corSecundaria: '#e2e8f0',
    exibirLogo: true,
    exibirTitulo: true,
    exibirSubtitulo: true,
    exibirTexto: true,
    exibirCidadeData: true,
    exibirAssinatura1: true,
    exibirAssinatura2: true,
    exibirBorda: true
  }
];

export const diplomaService = {
  async getTemplates(): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('documentos_templates')
        .select('conteudo')
        .eq('id', 'diplomas')
        .maybeSingle();

      if (!error && data && data.conteudo) {
        return data.conteudo;
      }
    } catch (e) {
      console.error('[diplomaService] Erro ao buscar templates do Supabase:', e);
    }

    return INITIAL_MODELOS;
  },

  async saveTemplates(templates: any[]): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('documentos_templates')
        .upsert({
          id: 'diplomas',
          conteudo: templates,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('[diplomaService] Erro ao salvar templates no Supabase:', e);
      return false;
    }
  }
};
