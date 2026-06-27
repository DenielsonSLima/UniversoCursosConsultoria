// File: modules/gestor/cadastros/modelos-documentos/diploma/diploma.service.ts
// REGRA ABSOLUTA: ZERO localStorage. Supabase é a única fonte de dados.

import { supabase } from '../../../../../lib/supabase';

const EAD_FRONT_TEXT =
  'Certificamos que o(a) aluno(a) <strong>{{nome_aluno}}</strong>, inscrito(a) no CPF {{cpf}}, concluiu com êxito o curso de <strong>{{curso_nome}}</strong>, com carga horária de {{carga_horaria}} hora(s), na modalidade EAD, realizado através da Universo Cursos e Consultoria, cumprindo todas as atividades previstas, de acordo com a legislação aplicável à formação profissional (LDB nº 9.394/1996, Decreto nº 5.154/2004 e Portaria MEC nº 1.015/2018).<br /><br />No período de {{data_inicio}} até {{data_fim}}.<br />Código do certificado: {{codigo_certificado}}';

const EAD_BACK_TEXT =
  '{{grade_curricular}}';

const FIXED_CERTIFICATE_MODELS = [
  {
    id: 'certificado_especializacao',
    fixed: true,
    nome: 'Certificado - Especialização',
    tipoCurso: 'Cursos Especialização',
    status: 'ativo',
    hasVerso: true,
    hasWatermark: true,
    watermarkText: 'MARCA D\'ÁGUA PADRÃO',
    hasValidationQrCode: true,
    textoFrente: 'A Direção da Instituição, no uso de suas atribuições regimentais, confere o presente certificado a <strong>{{nome_aluno}}</strong>, portador do CPF {{cpf}}, por haver concluído em {{data_conclusao}} o curso de Especialização em <strong>{{curso_nome}}</strong>, com carga horária total de {{carga_horaria}} horas.',
    textoVerso: 'Conteúdo Programático:\n\n{{grade_curricular}}',
    layout: 'classic',
    usePhotoshopLayout: true,
    ocultarDesignPadrao: true,
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
    exibirBorda: false
  },
  {
    id: 'certificado_livre',
    fixed: true,
    nome: 'Certificado - Cursos Livres',
    tipoCurso: 'Cursos Livres',
    status: 'ativo',
    hasVerso: false,
    hasWatermark: false,
    watermarkText: '',
    hasValidationQrCode: true,
    textoFrente: 'Certificamos que {{nome_aluno}} concluiu brilhantemente o curso livre de {{curso_nome}} com carga horária de {{carga_horaria}} horas. Parabéns pelo desempenho!',
    textoVerso: '',
    layout: 'classic',
    usePhotoshopLayout: true,
    ocultarDesignPadrao: true,
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
    exibirBorda: false
  },
  {
    id: 'certificado_tecnico',
    fixed: true,
    nome: 'Certificado - Cursos Técnicos',
    tipoCurso: 'Cursos Técnicos',
    status: 'ativo',
    hasVerso: true,
    hasWatermark: true,
    watermarkText: 'DOCUMENTO OFICIAL',
    hasValidationQrCode: true,
    textoFrente: 'Certificamos para os devidos fins que <strong>{{nome_aluno}}</strong>, portador do CPF {{cpf}}, concluiu com êxito o curso de formação de Técnico em <strong>{{curso_nome}}</strong>, perfazendo um total de {{carga_horaria}} horas-aula, possuindo as competências profissionais requeridas.',
    textoVerso: 'Grade Curricular do Curso Técnico:\n\n{{grade_curricular}}\n\nENSINO MÉDIO\nEstabelecimento: {{ensino_medio_estabelecimento}}\nLocalidade / UF: {{ensino_medio_localidade_uf}}\nAno de conclusão: {{ensino_medio_ano_conclusao}}\n\nCertificado Expedido N° {{certificado_numero}} lavrado à Página {{pagina_livro}} do Livro {{livro}}.\nValidação do SISTEC: {{validacao_sistec}}',
    layout: 'classic',
    usePhotoshopLayout: true,
    ocultarDesignPadrao: true,
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
    exibirBorda: false
  },
  {
    id: 'certificado_ead',
    fixed: true,
    nome: 'Certificado - EAD',
    tipoCurso: 'Educação a Distância (EAD)',
    status: 'ativo',
    hasVerso: true,
    hasWatermark: true,
    watermarkText: 'EAD INSTITUCIONAL',
    hasValidationQrCode: true,
    textoFrente: EAD_FRONT_TEXT,
    textoVerso: EAD_BACK_TEXT,
    layout: 'classic',
    usePhotoshopLayout: true,
    ocultarDesignPadrao: true,
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
    exibirBorda: false
  }
];

const legacyTypeById: Record<string, string> = {
  '1': 'Cursos Especialização',
  '2': 'Cursos Livres',
  '3': 'Cursos Técnicos',
  '4': 'Educação a Distância (EAD)',
};

const normalizeFixedTemplates = (templates: any[] = []) => {
  return FIXED_CERTIFICATE_MODELS.map(defaultModel => {
    const persisted = templates.find(item =>
      item.id === defaultModel.id ||
      item.tipoCurso === defaultModel.tipoCurso ||
      legacyTypeById[item.id] === defaultModel.tipoCurso
    );

    const normalized = {
      ...defaultModel,
      ...(persisted || {}),
      id: defaultModel.id,
      fixed: true,
      nome: defaultModel.nome,
      tipoCurso: defaultModel.tipoCurso,
      usePhotoshopLayout: true,
      ocultarDesignPadrao: true,
      exibirBorda: false,
    };

    if (normalized.id === 'certificado_ead') {
      if (!/LDB n[º°]\s*9\.394\/1996|V[aá]lido em todo o pa[ií]s/i.test(String(normalized.textoFrente || ''))) {
        normalized.textoFrente = EAD_FRONT_TEXT;
      }
      if (!/DECRETO PRESIDENCIAL N[°º]\s*5\.154/i.test(String(normalized.textoVerso || ''))) {
        normalized.textoVerso = EAD_BACK_TEXT;
      }
    }

    return normalized;
  });
};

export const diplomaService = {
  async getTemplates(): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('documentos_templates')
        .select('conteudo')
        .eq('id', 'diplomas')
        .maybeSingle();

      if (!error && data && data.conteudo) {
        return normalizeFixedTemplates(data.conteudo);
      }
    } catch (e) {
      console.error('[diplomaService] Erro ao buscar templates do Supabase:', e);
    }

    return normalizeFixedTemplates();
  },

  async saveTemplates(templates: any[]): Promise<boolean> {
    try {
      const fixedTemplates = normalizeFixedTemplates(templates);
      const { error } = await supabase
        .from('documentos_templates')
        .upsert({
          id: 'diplomas',
          conteudo: fixedTemplates,
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
