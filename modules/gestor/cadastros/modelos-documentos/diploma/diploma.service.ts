// File: modules/gestor/cadastros/modelos-documentos/diploma/diploma.service.ts
// REGRA ABSOLUTA: ZERO localStorage. Supabase é a única fonte de dados.

import { supabase } from '../../../../../lib/supabase';

const EAD_FRONT_TEXT =
  'Certificamos que o(a) aluno(a) <strong>{{nome_aluno}}</strong>, inscrito(a) no CPF {{cpf}}, concluiu com êxito o curso de <strong>{{curso_nome}}</strong>, com carga horária de {{carga_horaria}} hora(s), na modalidade EAD, realizado através da Universo Cursos e Consultoria, cumprindo todas as atividades previstas, de acordo com a legislação aplicável à formação profissional (LDB nº 9.394/1996, Decreto nº 5.154/2004 e Portaria MEC nº 1.015/2018).<br /><br />No período de {{data_inicio}} até {{data_fim}}.<br />Código do certificado: {{codigo_certificado}}';

const PRESENTIAL_FRONT_TEXT =
  'Certificamos que o(a) aluno(a) <strong>{{nome_aluno}}</strong>, inscrito(a) no CPF {{cpf}}, concluiu com êxito o curso presencial de <strong>{{curso_nome}}</strong>, com carga horária de {{carga_horaria}} hora(s), realizado através da Universo Cursos e Consultoria, cumprindo todas as atividades previstas, de acordo com a legislação aplicável à formação e qualificação profissional (LDB nº 9.394/1996 e Decreto nº 5.154/2004).<br /><br />No período de {{data_inicio}} até {{data_fim}}.<br />Código do certificado: {{codigo_certificado}}';

const TECHNICAL_FRONT_TEXT =
  'A Diretora da Universo Cursos e Consultoria, de acordo com o disposto no artigo 24, inciso VII da Lei Nº 9.394/1996, confere o título de <strong>{{curso_titulo}}</strong> a <strong>{{nome_aluno}}</strong>, nacionalidade Brasileira, natural de {{naturalidade}}, nascido(a) em {{data_nascimento}} e cédula de identidade n° {{rg}}, por ter sido aprovado(a) nos componentes curriculares que compõem a Organização Curricular do Curso <strong>{{curso_titulo}}</strong>, concluído em {{data_conclusao}} o curso no eixo tecnológico {{eixo_tecnologico}}, a fim de que possa gozar de todos os direitos e prerrogativas concedidas a este título pelas Leis do País.<br /><br />Código de verificação do certificado: <strong>{{codigo_certificado}}</strong>.';

const TECHNICAL_BACK_TEXT =
  'OBSERVAÇÃO:\n\nÓRGÃO DE FISCALIZAÇÃO PROFISSIONAL:\n\n{{nome_aluno}}\nENSINO MÉDIO\nESTABELECIMENTO: {{ensino_medio_estabelecimento}}\nLOCALIDADE DA UNIDADE FEDERAÇÃO: {{ensino_medio_localidade_uf}}\nANO DE CONCLUSÃO: {{ensino_medio_ano_conclusao}}\n\nCertificado Expedido N° {{certificado_numero}} lavrado à Página {{pagina_livro}} do Livro {{livro}}.\nValidação do SISTEC: {{validacao_sistec}}\n{{cidade_uf}}, {{data_conclusao_extenso}}.\n\n{{secretaria_nome}}\n{{secretaria_cargo}}\n\n{{diretoria_geral_nome}}\n{{diretoria_geral_cargo}}\n\nValidador: <strong style="color:#dc2626">www.universocc.com.br/validador</strong>\nCódigo de verificação: {{codigo_certificado}}';

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
    textoFrente: TECHNICAL_FRONT_TEXT,
    textoVerso: TECHNICAL_BACK_TEXT,
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

const EAD_CLONED_CERTIFICATE_IDS = new Set([
  'certificado_livre',
  'certificado_especializacao',
]);

const hasEadTerms = (value: string) =>
  /modalidade\s+EAD|educa[cç][aã]o\s+a\s+dist[aâ]ncia|Portaria\s+MEC\s+n[º°]?\s*1\.015\/2018|EAD\s+INSTITUCIONAL/i.test(String(value || ''));

const hasLegacyTechnicalText = (value: string) =>
  /Certificamos\s+para\s+os\s+devidos\s+fins|forma[cç][aã]o\s+de\s+T[eé]cnico\s+em|possuindo\s+as\s+compet[eê]ncias\s+profissionais\s+requeridas/i.test(String(value || ''));

const needsTechnicalFrontText = (value: string) => {
  const content = String(value || '');
  return hasLegacyTechnicalText(content)
    || !/artigo\s+24/i.test(content)
    || !/{{codigo_certificado}}/.test(content);
};

const needsTechnicalBackText = (value: string) => {
  const content = String(value || '');
  return !/OBSERVA[CÇ][AÃ]O/i.test(content)
    || !/ÓRGÃO DE FISCALIZAÇÃO PROFISSIONAL|ORGAO DE FISCALIZACAO PROFISSIONAL/i.test(content)
    || !/www\.universocc\.com\.br\/validador/i.test(content)
    || !/color:\s*#dc2626[^>]*>\s*www\.universocc\.com\.br\/validador/i.test(content)
    || !/{{codigo_certificado}}/.test(content)
    || /Juliana Rebeka|Ladja Maria/i.test(content);
};

const normalizeFixedTemplates = (templates: any[] = []) => {
  const findPersistedTemplate = (defaultModel: any) => templates.find(item =>
    item.id === defaultModel.id ||
    item.tipoCurso === defaultModel.tipoCurso ||
    legacyTypeById[item.id] === defaultModel.tipoCurso
  );

  const eadDefault = FIXED_CERTIFICATE_MODELS.find(model => model.id === 'certificado_ead')!;
  const persistedEad = findPersistedTemplate(eadDefault);
  const eadModelBase = {
    ...eadDefault,
    ...(persistedEad || {}),
    id: eadDefault.id,
    fixed: true,
    nome: eadDefault.nome,
    tipoCurso: eadDefault.tipoCurso,
    usePhotoshopLayout: true,
    ocultarDesignPadrao: true,
    exibirBorda: false,
  };

  return FIXED_CERTIFICATE_MODELS.map(defaultModel => {
    const persisted = findPersistedTemplate(defaultModel);
    const baseModel = EAD_CLONED_CERTIFICATE_IDS.has(defaultModel.id)
      ? eadModelBase
      : persisted;

    const normalized = {
      ...defaultModel,
      ...(baseModel || {}),
      id: defaultModel.id,
      fixed: true,
      nome: defaultModel.nome,
      tipoCurso: defaultModel.tipoCurso,
      usePhotoshopLayout: true,
      ocultarDesignPadrao: true,
      exibirBorda: false,
    };

    if (normalized.id === 'certificado_tecnico') {
      if (needsTechnicalFrontText(normalized.textoFrente)) {
        normalized.textoFrente = TECHNICAL_FRONT_TEXT;
      }
      if (needsTechnicalBackText(normalized.textoVerso)) {
        normalized.textoVerso = TECHNICAL_BACK_TEXT;
      }
      if (Array.isArray(normalized.blocks)) {
        normalized.blocks = normalized.blocks.map((block: any) => {
          if (block?.id === 'texto' && needsTechnicalFrontText(block.content)) {
            return { ...block, content: TECHNICAL_FRONT_TEXT };
          }
          if (block?.id === 'qrcode') {
            return { ...block, visible: false };
          }
          if (block?.id === 'assinatura1') {
            return {
              ...block,
              signerNameContent: '{{diretoria_geral_nome}}',
              title: '{{diretoria_geral_cargo}}',
              signatureSource: block.signatureSource || 'diretoriaGeral',
            };
          }
          if (block?.id === 'assinatura2') {
            return {
              ...block,
              signerNameContent: '{{nome_aluno}}',
              title: 'Titular do Diploma',
            };
          }
          if (block?.id === 'versoSecretariaEscolar') {
            return { ...block, content: '{{secretaria_nome}}<br />{{secretaria_cargo}}' };
          }
          if (block?.id === 'versoDiretoraGeral') {
            return { ...block, content: '{{diretoria_geral_nome}}<br />{{diretoria_geral_cargo}}' };
          }
          if (['historico', 'registro', 'carimbo'].includes(block?.id)) {
            return { ...block, visible: false };
          }
          return block;
        });
      }
    }

    if (normalized.id === 'certificado_ead') {
      if (!/LDB n[º°]\s*9\.394\/1996|V[aá]lido em todo o pa[ií]s/i.test(String(normalized.textoFrente || ''))) {
        normalized.textoFrente = EAD_FRONT_TEXT;
      }
      if (!/DECRETO PRESIDENCIAL N[°º]\s*5\.154/i.test(String(normalized.textoVerso || ''))) {
        normalized.textoVerso = EAD_BACK_TEXT;
      }
    }

    if (EAD_CLONED_CERTIFICATE_IDS.has(normalized.id)) {
      if (hasEadTerms(normalized.textoFrente) || !/LDB n[º°]\s*9\.394\/1996/i.test(String(normalized.textoFrente || ''))) {
        normalized.textoFrente = PRESENTIAL_FRONT_TEXT;
      }
      normalized.textoVerso = EAD_BACK_TEXT;
      if (hasEadTerms(normalized.watermarkText)) {
        normalized.watermarkText = normalized.id === 'certificado_livre' ? 'CURSOS LIVRES' : 'ESPECIALIZAÇÃO';
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
