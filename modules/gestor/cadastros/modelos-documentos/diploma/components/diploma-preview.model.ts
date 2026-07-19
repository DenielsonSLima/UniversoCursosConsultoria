export interface DiplomaPreviewProps {
  formData: any;
  page: 'frente' | 'verso';
  zoomLevel: number;
  previewValues?: Record<string, string>;
  isEditable?: boolean;
  selectedBlockId?: string | null;
  onSelectBlock?: (blockId: string | null) => void;
  onChangeBlocks?: (blocks: any[]) => void;
}

export const posicoesPadrao: Record<string, { x: number; y: number }> = {
  selo: { x: 46.0, y: 10.0 },
  titulo: { x: 10.0, y: 27.0 },
  subtitulo: { x: 10.0, y: 40.0 },
  texto: { x: 10.0, y: 48.0 },
  cidadeData: { x: 10.0, y: 70.0 },
  assinatura1: { x: 15.0, y: 78.0 },
  assinatura1Imagem: { x: 17.0, y: 71.0 },
  assinatura2: { x: 55.0, y: 78.0 },
  assinatura2Imagem: { x: 57.0, y: 71.0 },
  qrcode: { x: 80.0, y: 72.0 },
  conteudoProgramaticoTitulo: { x: 6.0, y: 10.0 },
  validacaoSite: { x: 50.0, y: 76.0 },
  historico: { x: 6.0, y: 16.0 },
  cursosLivresLegal: { x: 6.0, y: 58.0 },
  validadeNacional: { x: 6.0, y: 64.0 },
  registro: { x: 65.0, y: 10.0 },
  carimbo: { x: 65.0, y: 70.0 },
  versoQrcode: { x: 65.0, y: 44.0 },
  versoObservacaoTitulo: { x: 18.0, y: 14.0 },
  versoOrgaoTitulo: { x: 49.8, y: 14.0 },
  versoAlunoNome: { x: 17.0, y: 49.2 },
  versoEnsinoMedioTitulo: { x: 17.0, y: 53.2 },
  versoEnsinoMedioEstabelecimento: { x: 18.0, y: 58.5 },
  versoEnsinoMedioLocalidade: { x: 18.0, y: 63.4 },
  versoEnsinoMedioAno: { x: 18.0, y: 68.0 },
  versoRegistroTexto: { x: 18.0, y: 76.4 },
  versoSistecTexto: { x: 57.0, y: 76.4 },
  versoDataTexto: { x: 40.0, y: 83.2 },
  versoSecretariaAssinaturaImagem: { x: 25.0, y: 84.4 },
  versoDiretoraAssinaturaImagem: { x: 64.5, y: 84.4 },
  versoSecretariaLinha: { x: 22.5, y: 89.2 },
  versoDiretoraLinha: { x: 62.0, y: 89.2 },
  versoSecretariaEscolar: { x: 22.5, y: 90.4 },
  versoDiretoraGeral: { x: 62.0, y: 90.4 },
  versoValidadorSite: { x: 73.0, y: 36.8 },
};

export const EAD_FRONT_TEXT =
  'Certificamos que o(a) aluno(a) <strong>{{nome_aluno}}</strong>, inscrito(a) no CPF {{cpf}}, concluiu com êxito o curso de <strong>{{curso_nome}}</strong>, com carga horária de {{carga_horaria}} hora(s), na modalidade EAD, realizado através da Universo Cursos e Consultoria, cumprindo todas as atividades previstas, de acordo com a legislação aplicável à formação profissional (LDB nº 9.394/1996, Decreto nº 5.154/2004 e Portaria MEC nº 1.015/2018).<br /><br />No período de {{data_inicio}} até {{data_fim}}.<br />Código do certificado: {{codigo_certificado}}';

export const PRESENTIAL_FRONT_TEXT =
  'Certificamos que o(a) aluno(a) <strong>{{nome_aluno}}</strong>, inscrito(a) no CPF {{cpf}}, concluiu com êxito o curso presencial de <strong>{{curso_nome}}</strong>, com carga horária de {{carga_horaria}} hora(s), realizado através da Universo Cursos e Consultoria, cumprindo todas as atividades previstas, de acordo com a legislação aplicável à formação e qualificação profissional (LDB nº 9.394/1996 e Decreto nº 5.154/2004).<br /><br />No período de {{data_inicio}} até {{data_fim}}.<br />Código do certificado: {{codigo_certificado}}';

export const TECHNICAL_FRONT_TEXT =
  'A Diretora da Universo Cursos e Consultoria, de acordo com o disposto no artigo 24, inciso VII da Lei Nº 9.394/1996, confere o título de <strong>{{curso_titulo}}</strong> a <strong>{{nome_aluno}}</strong>, nacionalidade Brasileira, natural de {{naturalidade}}, nascido(a) em {{data_nascimento}} e cédula de identidade n° {{rg}}, por ter sido aprovado(a) nos componentes curriculares que compõem a Organização Curricular do Curso <strong>{{curso_titulo}}</strong>, concluído em {{data_conclusao}} o curso no eixo tecnológico {{eixo_tecnologico}}, a fim de que possa gozar de todos os direitos e prerrogativas concedidas a este título pelas Leis do País.<br /><br />Código de verificação do certificado: <strong>{{codigo_certificado}}</strong>.';

export const TECHNICAL_BACK_TEXT =
  'OBSERVAÇÃO:\n\nÓRGÃO DE FISCALIZAÇÃO PROFISSIONAL:\n\n{{nome_aluno}}\nENSINO MÉDIO\nESTABELECIMENTO: {{ensino_medio_estabelecimento}}\nLOCALIDADE DA UNIDADE FEDERAÇÃO: {{ensino_medio_localidade_uf}}\nANO DE CONCLUSÃO: {{ensino_medio_ano_conclusao}}\n\nCertificado Expedido N° {{certificado_numero}} lavrado à Página {{pagina_livro}} do Livro {{livro}}.\nValidação do SISTEC: {{validacao_sistec}}\n{{cidade_uf}}, {{data_conclusao_extenso}}.\n\n{{secretaria_nome}}\n{{secretaria_cargo}}\n\n{{diretoria_geral_nome}}\n{{diretoria_geral_cargo}}\n\nValidador: <strong style="color:#dc2626">www.universocc.com.br/validador</strong>\nCódigo de verificação: {{codigo_certificado}}';

export const EAD_VALIDITY_TEXT =
  'VÁLIDO EM TODO O TERRITÓRIO NACIONAL COMO COMPROVANTE DE CAPACITAÇÃO E QUALIFICAÇÃO PROFISSIONAL.';
export const PRESENTIAL_VALIDITY_TEXT =
  'CERTIFICADO VÁLIDO COMO COMPROVANTE DE CONCLUSÃO DE CURSO PRESENCIAL DE CAPACITAÇÃO E QUALIFICAÇÃO PROFISSIONAL.';
export const EAD_BACK_TITLE_TEXT = 'CONTEÚDO PROGRAMÁTICO';
export const EAD_BACK_LEGAL_TEXT =
  'CURSOS LIVRES SÃO LEGAIS COM BASE NO DECRETO PRESIDENCIAL N° 5.154.';
export const PRESENTIAL_BACK_LEGAL_TEXT =
  'CURSO PRESENCIAL DE FORMAÇÃO E QUALIFICAÇÃO PROFISSIONAL, COM BASE NA LDB Nº 9.394/1996 E NO DECRETO Nº 5.154/2004.';
export const EAD_BACK_TEXT = '{{grade_curricular}}';

export const validationSiteContent =
  '<strong style="color:#dc2626">www.universocc.com.br/validador</strong><br /><strong>AVISO DE AUTENTICIDADE:</strong> consulte a autenticidade deste certificado pelo QR Code ou pelo código de autenticidade.';
export const technicalValidationSiteContent =
  '<strong>Validador do certificado</strong><br /><strong style="color:#dc2626">www.universocc.com.br/validador</strong><br />Código: {{codigo_certificado}}';

export const isTechnicalCertificate = (formData: any) =>
  formData?.tipoCurso === 'Cursos Técnicos' || formData?.id === 'certificado_tecnico';

export const isEadCertificate = (formData: any) =>
  formData?.tipoCurso === 'Educação a Distância (EAD)' || formData?.id === 'certificado_ead';

export const isPresentialProfessionalCertificate = (formData: any) =>
  ['certificado_livre', 'certificado_especializacao'].includes(formData?.id);

export const usesProgrammaticBackLayout = (formData: any) =>
  isEadCertificate(formData) || isPresentialProfessionalCertificate(formData);

export const getTechnicalCourseTitle = (courseName: string) => {
  const normalized = String(courseName || '').trim();
  if (!normalized) return 'TÉCNICO EM __________________';
  const title = /^t[eé]cnico\s+em\s+/i.test(normalized) ? normalized : `Técnico em ${normalized}`;
  return title.toLocaleUpperCase('pt-BR');
};

export const getTemplateBackgroundUrl = (template: any, page: 'frente' | 'verso') => {
  if (!template) return '';
  if (page === 'frente') {
    return template.bgFrenteUrl || template.frenteUrl || template.backgroundFrenteUrl || template.bg_frente_url || '';
  }
  return template.bgVersoUrl || template.versoUrl || template.backgroundVersoUrl || template.bg_verso_url || '';
};
