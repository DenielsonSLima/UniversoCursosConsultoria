// File: modules/gestor/cadastros/modelos-documentos/diploma/components/DiplomaPreview.tsx

import React, { useEffect, useState } from 'react';
import { Award, X } from 'lucide-react';
import { getDocumentValidationUrl, getDocumentValidationQrUrl } from '../../../../../shared/document-validation/document-validation.url';
import { assinaturasService, AssinaturasData } from '../../../../configuracoes/assinaturas/assinaturas.service';

interface DiplomaPreviewProps {
  formData: any;
  page: 'frente' | 'verso';
  zoomLevel: number;
  previewValues?: Record<string, string>;
  isEditable?: boolean; // True when on the active editing tabs (frente/verso)
  selectedBlockId?: string | null;
  onSelectBlock?: (blockId: string | null) => void;
  onChangeBlocks?: (blocks: any[]) => void;
}

// Coordenadas padrão iniciais em porcentagem (%) para o A4 paisagem (297mm x 210mm)
export const posicoesPadrao: Record<string, { x: number; y: number }> = {
  // Frente
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
  // Verso
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
  versoValidadorSite: { x: 73.0, y: 36.8 }
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

export const EAD_BACK_TEXT =
  '{{grade_curricular}}';

const normalizeSignatureBlock = (block: any) => {
  if (block?.type !== 'signature') return block;

  const signatureDefaultSource =
    block.id === 'assinatura1'
      ? 'diretoriaGeral'
      : block.id === 'assinatura2'
      ? 'none'
      : 'none';
  const legacySignatureSource = ['secretaria', 'coordenacao', 'coordenação'].includes(block.signatureSource)
    ? 'none'
    : block.signatureSource;
  const legacyTitle = String(block.title || '').toLowerCase();
  const title = block.id === 'assinatura1' && !block.title
    ? 'Diretor Geral'
    : block.id === 'assinatura2' && (!block.title || legacyTitle.includes('secretaria') || legacyTitle.includes('coordena'))
    ? 'Aluno(a)'
    : block.title || 'Assinatura';

  return {
    ...block,
    signatureSource: legacySignatureSource ?? signatureDefaultSource,
    signatureImageUrl: block.signatureImageUrl || '',
    signatureBlend: block.signatureBlend ?? true,
    signatureImageOffsetY: Number(block.signatureImageOffsetY || 0),
    signatureLabelFontSize: block.signatureLabelFontSize != null ? Number(block.signatureLabelFontSize) : 10,
    label: block.id === 'assinatura2' ? 'Assinatura do(a) Aluno(a)' : block.label,
    title,
  };
};

const isTechnicalCertificate = (formData: any) =>
  formData?.tipoCurso === 'Cursos Técnicos' || formData?.id === 'certificado_tecnico';

const isEadCertificate = (formData: any) =>
  formData?.tipoCurso === 'Educação a Distância (EAD)' || formData?.id === 'certificado_ead';

const isPresentialProfessionalCertificate = (formData: any) =>
  ['certificado_livre', 'certificado_especializacao'].includes(formData?.id);

const usesProgrammaticBackLayout = (formData: any) =>
  isEadCertificate(formData) || isPresentialProfessionalCertificate(formData);

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

const getTechnicalCourseTitle = (courseName: string) => {
  const normalized = String(courseName || '').trim();
  if (!normalized) return 'TÉCNICO EM __________________';
  const title = /^t[eé]cnico\s+em\s+/i.test(normalized)
    ? normalized
    : `Técnico em ${normalized}`;
  return title.toLocaleUpperCase('pt-BR');
};

const validationSiteContent =
  '<strong style="color:#dc2626">www.universocc.com.br/validador</strong><br /><strong>AVISO DE AUTENTICIDADE:</strong> consulte a autenticidade deste certificado pelo QR Code ou pelo código de autenticidade.';

const technicalValidationSiteContent =
  '<strong>Validador do certificado</strong><br /><strong style="color:#dc2626">www.universocc.com.br/validador</strong><br />Código: {{codigo_certificado}}';

export const getTemplateBackgroundUrl = (template: any, page: 'frente' | 'verso') => {
  if (!template) return '';

  if (page === 'frente') {
    return template.bgFrenteUrl || template.frenteUrl || template.backgroundFrenteUrl || template.bg_frente_url || '';
  }

  return template.bgVersoUrl || template.versoUrl || template.backgroundVersoUrl || template.bg_verso_url || '';
};

const stripEadValidityText = (content: string) =>
  String(content || '')
    .replace(/(?:<br\s*\/?>\s*){0,4}V[aá]lido em todo (?:o pa[ií]s|o territ[oó]rio nacional)[\s\S]*?qualifica[cç][aã]o profissional\.?/gi, '')
    .trim();

const stripEadBackDecorations = (content: string) => {
  const cleaned = String(content || '')
    .replace(/^\s*Conte[uú]do Program[aá]tico:\s*/i, '')
    .replace(/CURSOS LIVRES S[ÃA]O LEGAIS COM BASE NO DECRETO PRESIDENCIAL N[°º]\s*5\.154\.?/gi, '')
    .replace(/CURSO PRESENCIAL DE FORMAÇÃO E QUALIFICAÇÃO PROFISSIONAL, COM BASE NA LDB N[º°]\s*9\.394\/1996 E NO DECRETO N[º°]\s*5\.154\/2004\.?/gi, '')
    .trim();

  return cleaned || EAD_BACK_TEXT;
};

const highlightApprovalStatus = (html: string) =>
  String(html || '').replace(
    /\s*-\s*Aprovado\b/gi,
    '<br /><br /><span style="display:inline-block;padding:4px 12px;border-radius:999px;background:#001a33;color:#ffffff;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;">APROVADO</span>'
  );

const parseProgrammaticRows = (content: string) => {
  const plain = String(content || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ');

  return plain
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^conte[uú]do program[aá]tico:?$/i.test(line))
    .map((line) => {
      const parts = line.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
      if (parts.length < 2) return null;

      const status = parts.slice(2).join(' - ');
      return {
        nome: parts[0],
        carga: parts[1] || '',
        status: status || '',
      };
    })
    .filter(Boolean) as Array<{ nome: string; carga: string; status: string }>;
};

const normalizeLegacyBlock = (block: any, formData: any) => {
  const technical = isTechnicalCertificate(formData);
  const ead = isEadCertificate(formData);
  const presentialProfessional = isPresentialProfessionalCertificate(formData);
  const programmaticBackLayout = usesProgrammaticBackLayout(formData);
  let normalized = normalizeSignatureBlock(block);

  if (normalized.id === 'cidadeData' && /aracaju\/se/i.test(String(normalized.content || ''))) {
    normalized = { ...normalized, content: '{{cidade_uf}}, {{data_conclusao}}' };
  }

  if (normalized.id === 'historico' && !technical) {
    const legacyContent = String(normalized.content || '');
    if (/sistec|c[oó]digo de autenticidade|livro_registro|certificado expedido/i.test(legacyContent)) {
      normalized = { ...normalized, content: 'Conteúdo Programático:\n\n{{grade_curricular}}' };
    }
  }

  if (normalized.id === 'texto' && technical && needsTechnicalFrontText(normalized.content)) {
    normalized = {
      ...normalized,
      content: TECHNICAL_FRONT_TEXT,
    };
  }

  if (normalized.id === 'qrcode' && technical) {
    normalized = { ...normalized, visible: false };
  }

  if (normalized.id === 'assinatura1' && technical) {
    normalized = {
      ...normalized,
      signerNameContent: '{{diretoria_geral_nome}}',
      title: '{{diretoria_geral_cargo}}',
      signatureSource: normalized.signatureSource || 'diretoriaGeral',
    };
  }

  if (normalized.id === 'assinatura2' && technical) {
    normalized = {
      ...normalized,
      signerNameContent: '{{nome_aluno}}',
      title: 'Titular do Diploma',
    };
  }

  if (normalized.id === 'versoSecretariaEscolar' && technical) {
    normalized = { ...normalized, content: '{{secretaria_nome}}<br />{{secretaria_cargo}}' };
  }

  if (normalized.id === 'versoDiretoraGeral' && technical) {
    normalized = { ...normalized, content: '{{diretoria_geral_nome}}<br />{{diretoria_geral_cargo}}' };
  }

  if (technical && ['historico', 'registro', 'carimbo'].includes(normalized.id)) {
    normalized = { ...normalized, visible: false };
  }

  if (normalized.id === 'versoQrcode' && technical) {
    const isOldDefaultPosition = Number(normalized.x) === posicoesPadrao.versoQrcode.x
      && Number(normalized.y) === posicoesPadrao.versoQrcode.y;
    normalized = {
      ...normalized,
      x: isOldDefaultPosition ? 83.5 : normalized.x ?? 83.5,
      y: isOldDefaultPosition ? 18.0 : normalized.y ?? 18.0,
      width: normalized.width || 96,
      visible: formData.hasValidationQrCode !== false,
    };
  }

  if (normalized.id === 'texto' && (ead || presentialProfessional)) {
    const content = stripEadValidityText(String(normalized.content || ''));
    normalized = {
      ...normalized,
      content: presentialProfessional
        ? (hasEadTerms(content) || !/LDB n[º°]\s*9\.394\/1996/i.test(content) ? PRESENTIAL_FRONT_TEXT : content)
        : (/LDB n[º°]\s*9\.394\/1996/i.test(content) ? content : EAD_FRONT_TEXT),
    };
  }

  if (normalized.id === 'historico' && programmaticBackLayout) {
    normalized = {
      ...normalized,
      content: stripEadBackDecorations(String(normalized.content || '')),
      tableTitleVisible: false,
      label: 'Conteúdo / Grade',
    };
  }

  if (normalized.id === 'validadeNacional' && programmaticBackLayout) {
    const wasOnFront = normalized.page !== 'verso';
    const savedContent = String(normalized.content || '').trim();
    const hasLegacyEadValidity = /V[aá]lido em todo o territ[oó]rio nacional como comprovante de capacita[cç][aã]o e qualifica[cç][aã]o profissional\.?/i.test(savedContent);
    const validityContent = hasLegacyEadValidity
      ? (presentialProfessional ? PRESENTIAL_VALIDITY_TEXT : EAD_VALIDITY_TEXT)
      : savedContent || (presentialProfessional ? PRESENTIAL_VALIDITY_TEXT : EAD_VALIDITY_TEXT);
    normalized = {
      ...normalized,
      label: 'Validade Nacional',
      page: 'verso',
      x: wasOnFront ? posicoesPadrao.validadeNacional.x : normalized.x ?? posicoesPadrao.validadeNacional.x,
      y: wasOnFront ? posicoesPadrao.validadeNacional.y : normalized.y ?? posicoesPadrao.validadeNacional.y,
      content: presentialProfessional && hasEadTerms(validityContent) ? PRESENTIAL_VALIDITY_TEXT : validityContent,
      visible: formData.hasVerso !== false,
    };
  }

  if (normalized.type === 'signatureImage') {
    normalized = {
      ...normalized,
      signatureBlend: normalized.signatureBlend ?? true,
      signatureSource: normalized.signatureSource || 'none',
      signatureImageUrl: normalized.signatureImageUrl || '',
      width: normalized.width || 220,
    };
  }

  if (normalized.id === 'registro') {
    normalized = { ...normalized, visible: technical && normalized.visible !== false };
  }

  if (normalized.id === 'carimbo' && !technical) {
    normalized = { ...normalized, visible: false };
  }

  if (normalized.id === 'validacaoSite') {
    const isOldDefaultPosition = technical
      && Number(normalized.x) === posicoesPadrao.validacaoSite.x
      && Number(normalized.y) === posicoesPadrao.validacaoSite.y;
    normalized = {
      ...normalized,
      x: isOldDefaultPosition ? posicoesPadrao.versoValidadorSite.x : normalized.x ?? posicoesPadrao.validacaoSite.x,
      y: isOldDefaultPosition ? posicoesPadrao.versoValidadorSite.y : Number(normalized.y) > 95 ? posicoesPadrao.validacaoSite.y : normalized.y ?? posicoesPadrao.validacaoSite.y,
      width: technical ? 250 : normalized.width,
      fontSize: technical ? 7 : normalized.fontSize,
      textAlign: technical ? 'center' : normalized.textAlign,
      content: technical ? technicalValidationSiteContent : validationSiteContent,
      visible: formData.hasVerso !== false,
    };
  }

  return normalized;
};

export const getBlocks = (formData: any) => {
  // Se não existir o array de blocks, vamos construí-lo a partir dos dados do modelo e posições
  const pos = formData.posicoes || posicoesPadrao;
  const technical = isTechnicalCertificate(formData);
  const ead = isEadCertificate(formData);
  const presentialProfessional = isPresentialProfessionalCertificate(formData);
  const programmaticBackLayout = usesProgrammaticBackLayout(formData);
  const sourceBlocks = Array.isArray(formData.blocks) ? formData.blocks : [];
  const existingSignature = (id: string) => sourceBlocks.find((block: any) => block.id === id && block.type === 'signature') || {};
  const technicalBackTextBlock = (
    id: string,
    label: string,
    content: string,
    options: Record<string, any> = {}
  ) => ({
    id,
    type: 'text',
    label,
    page: 'verso',
    x: pos[id]?.x ?? posicoesPadrao[id]?.x ?? 0,
    y: pos[id]?.y ?? posicoesPadrao[id]?.y ?? 0,
    width: options.width ?? 320,
    color: options.color ?? formData.corTexto ?? '#111827',
    fontSize: options.fontSize ?? 13,
    fontFamily: options.fontFamily ?? 'Arial, sans-serif',
    fontWeight: options.fontWeight ?? '900',
    textAlign: options.textAlign ?? 'left',
    lineHeight: options.lineHeight ?? 1.18,
    content,
    visible: technical && formData.hasVerso !== false,
  });
  const technicalBackBlocks = [
    technicalBackTextBlock('versoObservacaoTitulo', 'Observação', 'OBSERVAÇÃO:', { width: 300, fontSize: 14 }),
    technicalBackTextBlock('versoOrgaoTitulo', 'Órgão de Fiscalização', 'ÓRGÃO DE FISCALIZAÇÃO PROFISSIONAL:', { width: 500, fontSize: 14 }),
    technicalBackTextBlock('versoAlunoNome', 'Nome do Aluno', '{{nome_aluno}}', { width: 760, color: '#dc2626', fontSize: 14, textAlign: 'center' }),
    technicalBackTextBlock('versoEnsinoMedioTitulo', 'Ensino Médio', 'ENSINO MÉDIO', { width: 760, fontSize: 14, textAlign: 'center' }),
    technicalBackTextBlock('versoEnsinoMedioEstabelecimento', 'Ensino Médio - Estabelecimento', 'ESTABELECIMENTO: {{ensino_medio_estabelecimento}}', { width: 820, fontSize: 13 }),
    technicalBackTextBlock('versoEnsinoMedioLocalidade', 'Ensino Médio - Localidade', 'LOCALIDADE DA UNIDADE FEDERAÇÃO: {{ensino_medio_localidade_uf}}', { width: 820, fontSize: 13 }),
    technicalBackTextBlock('versoEnsinoMedioAno', 'Ensino Médio - Ano', 'ANO DE CONCLUSÃO: {{ensino_medio_ano_conclusao}}', { width: 820, fontSize: 13 }),
    technicalBackTextBlock('versoRegistroTexto', 'Registro do Certificado', 'Certificado Expedido N° {{certificado_numero}} lavrado à Página {{pagina_livro}} do Livro {{livro}}.', { width: 470, fontSize: 12, fontWeight: '700' }),
    technicalBackTextBlock('versoSistecTexto', 'Validação do SISTEC', 'Validação do SISTEC: {{validacao_sistec}}', { width: 360, fontSize: 12, fontWeight: '700' }),
    technicalBackTextBlock('versoDataTexto', 'Data de Expedição', '{{cidade_uf}}, {{data_conclusao_extenso}}.', { width: 350, fontSize: 12, textAlign: 'center' }),
    {
      id: 'versoSecretariaAssinaturaImagem',
      type: 'signatureImage',
      label: 'Assinatura Secretaria Escolar',
      page: 'verso',
      x: pos.versoSecretariaAssinaturaImagem?.x ?? posicoesPadrao.versoSecretariaAssinaturaImagem.x,
      y: pos.versoSecretariaAssinaturaImagem?.y ?? posicoesPadrao.versoSecretariaAssinaturaImagem.y,
      width: 210,
      signatureSource: 'secretaria',
      signatureImageUrl: '',
      signatureBlend: true,
      visible: technical && formData.hasVerso !== false,
    },
    {
      id: 'versoDiretoraAssinaturaImagem',
      type: 'signatureImage',
      label: 'Assinatura Diretoria Geral',
      page: 'verso',
      x: pos.versoDiretoraAssinaturaImagem?.x ?? posicoesPadrao.versoDiretoraAssinaturaImagem.x,
      y: pos.versoDiretoraAssinaturaImagem?.y ?? posicoesPadrao.versoDiretoraAssinaturaImagem.y,
      width: 210,
      signatureSource: 'diretoriaGeral',
      signatureImageUrl: '',
      signatureBlend: true,
      visible: technical && formData.hasVerso !== false,
    },
    {
      id: 'versoSecretariaLinha',
      type: 'line',
      label: 'Linha Assinatura Secretaria',
      page: 'verso',
      x: pos.versoSecretariaLinha?.x ?? posicoesPadrao.versoSecretariaLinha.x,
      y: pos.versoSecretariaLinha?.y ?? posicoesPadrao.versoSecretariaLinha.y,
      width: 310,
      color: formData.corTexto || '#111827',
      borderWidth: 1,
      visible: technical && formData.hasVerso !== false,
    },
    {
      id: 'versoDiretoraLinha',
      type: 'line',
      label: 'Linha Assinatura Diretoria',
      page: 'verso',
      x: pos.versoDiretoraLinha?.x ?? posicoesPadrao.versoDiretoraLinha.x,
      y: pos.versoDiretoraLinha?.y ?? posicoesPadrao.versoDiretoraLinha.y,
      width: 310,
      color: formData.corTexto || '#111827',
      borderWidth: 1,
      visible: technical && formData.hasVerso !== false,
    },
    technicalBackTextBlock('versoSecretariaEscolar', 'Secretária Escolar', '{{secretaria_nome}}<br />{{secretaria_cargo}}', { width: 310, fontSize: 12, textAlign: 'center', lineHeight: 1.08 }),
    technicalBackTextBlock('versoDiretoraGeral', 'Diretora Geral', '{{diretoria_geral_nome}}<br />{{diretoria_geral_cargo}}', { width: 310, fontSize: 12, textAlign: 'center', lineHeight: 1.08 }),
  ];
  const defaultBlocks = [
    {
      id: 'selo',
      type: 'logo',
      label: 'Selo / Logomarca',
      page: 'frente',
      x: pos.selo?.x ?? posicoesPadrao.selo.x,
      y: pos.selo?.y ?? posicoesPadrao.selo.y,
      width: formData.seloWidth || 96,
      visible: formData.exibirLogo !== false
    },
    {
      id: 'titulo',
      type: 'text',
      label: 'Título Principal',
      page: 'frente',
      x: pos.titulo?.x ?? posicoesPadrao.titulo.x,
      y: pos.titulo?.y ?? posicoesPadrao.titulo.y,
      fontSize: formData.tamanhoFonteTitulo || 45,
      width: 650,
      color: formData.corTexto || '#1e293b',
      fontFamily: "'Playfair Display', serif",
      fontWeight: '900',
      textAlign: 'center',
      content: 'Certificado',
      visible: formData.exibirTitulo !== false
    },
    {
      id: 'subtitulo',
      type: 'text',
      label: 'Subtítulo',
      page: 'frente',
      x: pos.subtitulo?.x ?? posicoesPadrao.subtitulo.x,
      y: pos.subtitulo?.y ?? posicoesPadrao.subtitulo.y,
      fontSize: formData.tamanhoFonteSubtitulo || 14,
      width: 650,
      color: formData.corTexto || '#1e293b',
      fontFamily: 'sans-serif',
      fontWeight: '700',
      textAlign: 'center',
      content: 'De Conclusão de Curso',
      visible: formData.exibirSubtitulo !== false
    },
    {
      id: 'texto',
      type: 'text',
      label: 'Texto Descritivo',
      page: 'frente',
      x: pos.texto?.x ?? posicoesPadrao.texto.x,
      y: pos.texto?.y ?? posicoesPadrao.texto.y,
      fontSize: formData.tamanhoFonteTexto || 24,
      width: 650,
      color: formData.corTexto || '#1e293b',
      fontFamily: 'serif',
      fontWeight: '400',
      textAlign: 'center',
      content: formData.textoFrente || (technical ? TECHNICAL_FRONT_TEXT : ead ? EAD_FRONT_TEXT : presentialProfessional ? PRESENTIAL_FRONT_TEXT : 'Certificamos que {{nome_aluno}} concluiu o curso de {{curso_nome}} com carga horária de {{carga_horaria}} horas.'),
      visible: formData.exibirTexto !== false
    },
    {
      id: 'cidadeData',
      type: 'text',
      label: 'Cidade e Data',
      page: 'frente',
      x: pos.cidadeData?.x ?? posicoesPadrao.cidadeData.x,
      y: pos.cidadeData?.y ?? posicoesPadrao.cidadeData.y,
      fontSize: formData.tamanhoFonteCidadeData || 12,
      width: 650,
      color: formData.corTexto || '#1e293b',
      fontFamily: 'sans-serif',
      fontWeight: '700',
      textAlign: 'center',
      content: '{{cidade_uf}}, {{data_conclusao}}',
      visible: formData.exibirCidadeData !== false
    },
    {
      id: 'validadeNacional',
      type: 'text',
      label: 'Validade Nacional',
      page: 'verso',
      x: pos.validadeNacional?.x ?? posicoesPadrao.validadeNacional.x,
      y: pos.validadeNacional?.y ?? posicoesPadrao.validadeNacional.y,
      fontSize: 13,
      width: 520,
      color: formData.corTexto || '#1e293b',
      fontFamily: 'serif',
      fontWeight: '400',
      textAlign: 'center',
      content: presentialProfessional ? PRESENTIAL_VALIDITY_TEXT : EAD_VALIDITY_TEXT,
      visible: programmaticBackLayout && formData.hasVerso !== false
    },
    {
      id: 'assinatura1',
      type: 'signature',
      label: 'Assinatura Diretor',
      page: 'frente',
      x: pos.assinatura1?.x ?? posicoesPadrao.assinatura1.x,
      y: pos.assinatura1?.y ?? posicoesPadrao.assinatura1.y,
      width: formData.assinaturaWidth || 256,
      signerNameContent: technical ? '{{diretoria_geral_nome}}' : undefined,
      title: technical ? '{{diretoria_geral_cargo}}' : 'Diretor Geral',
      signatureSource: 'diretoriaGeral',
      signatureImageUrl: '',
      signatureBlend: true,
      signatureImageOffsetY: 0,
      signatureNameFontSize: technical ? 11 : undefined,
      signatureLabelFontSize: technical ? 9 : 10,
      visible: formData.exibirAssinatura1 !== false
    },
    {
      id: 'assinatura1Imagem',
      type: 'signatureImage',
      label: 'Imagem Assinatura Diretor',
      page: 'frente',
      signatureBlockId: 'assinatura1',
      x: pos.assinatura1Imagem?.x ?? posicoesPadrao.assinatura1Imagem.x,
      y: pos.assinatura1Imagem?.y ?? posicoesPadrao.assinatura1Imagem.y,
      width: existingSignature('assinatura1').signatureImageWidth || 220,
      signatureSource: existingSignature('assinatura1').signatureSource || 'diretoriaGeral',
      signatureImageUrl: existingSignature('assinatura1').signatureImageUrl || '',
      signatureBlend: existingSignature('assinatura1').signatureBlend ?? true,
      visible: formData.exibirAssinatura1 !== false
    },
    {
      id: 'assinatura2',
      type: 'signature',
      label: 'Assinatura do(a) Aluno(a)',
      page: 'frente',
      x: pos.assinatura2?.x ?? posicoesPadrao.assinatura2.x,
      y: pos.assinatura2?.y ?? posicoesPadrao.assinatura2.y,
      width: formData.assinaturaWidth || 256,
      signerNameContent: technical ? '{{nome_aluno}}' : undefined,
      title: technical ? 'Titular do Diploma' : 'Aluno(a)',
      signatureNameFontSize: technical ? 11 : undefined,
      signatureLabelFontSize: technical ? 9 : undefined,
      visible: formData.exibirAssinatura2 !== false
    },
    {
      id: 'assinatura2Imagem',
      type: 'signatureImage',
      label: 'Imagem Assinatura Aluno(a)',
      page: 'frente',
      signatureBlockId: 'assinatura2',
      x: pos.assinatura2Imagem?.x ?? posicoesPadrao.assinatura2Imagem.x,
      y: pos.assinatura2Imagem?.y ?? posicoesPadrao.assinatura2Imagem.y,
      width: existingSignature('assinatura2').signatureImageWidth || 220,
      signatureSource: existingSignature('assinatura2').signatureSource || 'none',
      signatureImageUrl: existingSignature('assinatura2').signatureImageUrl || '',
      signatureBlend: existingSignature('assinatura2').signatureBlend ?? true,
      visible: false
    },
    {
      id: 'qrcode',
      type: 'qrcode',
      label: 'QR Code Autenticidade',
      page: 'frente',
      x: pos.qrcode?.x ?? posicoesPadrao.qrcode.x,
      y: pos.qrcode?.y ?? posicoesPadrao.qrcode.y,
      width: formData.qrcodeWidth || 170,
      visible: !technical && formData.hasValidationQrCode !== false
    },
    {
      id: 'validacaoSite',
      type: 'validationLink',
      label: 'Site de Validação',
      page: 'verso',
      x: pos.validacaoSite?.x ?? posicoesPadrao.validacaoSite.x,
      y: pos.validacaoSite?.y ?? posicoesPadrao.validacaoSite.y,
      width: 560,
      color: formData.corTexto || '#1e293b',
      fontSize: 10,
      fontFamily: 'sans-serif',
      textAlign: 'left',
      content: validationSiteContent,
      visible: formData.hasVerso !== false
    },
    ...technicalBackBlocks,
    {
      id: 'conteudoProgramaticoTitulo',
      type: 'text',
      label: 'Título Conteúdo Programático',
      page: 'verso',
      x: pos.conteudoProgramaticoTitulo?.x ?? posicoesPadrao.conteudoProgramaticoTitulo.x,
      y: pos.conteudoProgramaticoTitulo?.y ?? posicoesPadrao.conteudoProgramaticoTitulo.y,
      width: 560,
      color: formData.corTexto || '#1e293b',
      fontSize: 15,
      fontFamily: 'sans-serif',
      fontWeight: '900',
      textAlign: 'left',
      content: EAD_BACK_TITLE_TEXT,
      visible: programmaticBackLayout && formData.hasVerso !== false
    },
    {
      id: 'historico',
      type: 'table',
      label: 'Histórico Escolar / Grade',
      page: 'verso',
      x: pos.historico?.x ?? posicoesPadrao.historico.x,
      y: pos.historico?.y ?? posicoesPadrao.historico.y,
      width: 560,
      fontSize: 11,
      color: formData.corTexto || '#1e293b',
      fontFamily: 'monospace',
      textAlign: 'left',
      tableTitleVisible: !programmaticBackLayout,
      content: formData.textoVerso || (formData.tipoCurso === 'Cursos Técnicos' ? 'Grade Curricular do Curso:\n\n{{grade_curricular}}' : programmaticBackLayout ? EAD_BACK_TEXT : 'Conteúdo Programático:\n\n{{grade_curricular}}'),
      visible: formData.hasVerso !== false
    },
    {
      id: 'cursosLivresLegal',
      type: 'text',
      label: 'Base Legal Cursos Livres',
      page: 'verso',
      x: pos.cursosLivresLegal?.x ?? posicoesPadrao.cursosLivresLegal.x,
      y: pos.cursosLivresLegal?.y ?? posicoesPadrao.cursosLivresLegal.y,
      width: 560,
      color: formData.corTexto || '#1e293b',
      fontSize: 11,
      fontFamily: 'sans-serif',
      fontWeight: '900',
      textAlign: 'left',
      content: presentialProfessional ? PRESENTIAL_BACK_LEGAL_TEXT : EAD_BACK_LEGAL_TEXT,
      visible: programmaticBackLayout && formData.hasVerso !== false
    },
    {
      id: 'registro',
      type: 'registry',
      label: 'Livro de Registro',
      page: 'verso',
      x: pos.registro?.x ?? posicoesPadrao.registro.x,
      y: pos.registro?.y ?? posicoesPadrao.registro.y,
      visible: technical && formData.exibirVersoRegistro !== false
    },
    {
      id: 'versoQrcode',
      type: 'qrcode',
      label: 'QR Code Verso',
      page: 'verso',
      x: pos.versoQrcode?.x ?? posicoesPadrao.versoQrcode.x,
      y: pos.versoQrcode?.y ?? posicoesPadrao.versoQrcode.y,
      width: formData.qrcodeWidth || 170,
      visible: formData.hasValidationQrCode !== false
    },
    {
      id: 'carimbo',
      type: 'stamp',
      label: 'Carimbo / Visto',
      page: 'verso',
      x: pos.carimbo?.x ?? posicoesPadrao.carimbo.x,
      y: pos.carimbo?.y ?? posicoesPadrao.carimbo.y,
      visible: technical && formData.exibirVersoCarimbo !== false
    }
  ];

  if (formData.blocks && formData.blocks.length > 0) {
    const normalizedBlocks = formData.blocks.map((block: any) => normalizeLegacyBlock(block, formData));
    const existingIds = new Set(normalizedBlocks.map((block: any) => block.id));
    const missingBlocks = defaultBlocks
      .filter((block: any) => !existingIds.has(block.id))
      .map((block: any) => normalizeLegacyBlock(block, formData));
    return [...normalizedBlocks, ...missingBlocks];
  }

  return defaultBlocks.map((block: any) => normalizeLegacyBlock(block, formData));
};

const DiplomaPreview: React.FC<DiplomaPreviewProps> = ({ 
  formData, 
  page, 
  zoomLevel,
  previewValues = {},
  isEditable = false,
  selectedBlockId = null,
  onSelectBlock,
  onChangeBlocks
}) => {
  // Dados fictícios para preencher o visualizador
  const defaultPreviewData = {
    nome_aluno: 'JOÃO DA SILVA SAURO',
    cpf: '123.456.789-00',
    cidade: 'Cidade do Polo',
    uf: 'UF',
    cidade_uf: 'Cidade do Polo/UF',
    curso_nome:
      formData.tipoCurso === 'Cursos Técnicos'
        ? 'Técnico em Enfermagem'
        : formData.tipoCurso === 'Cursos Especialização'
        ? 'Especialização'
        : formData.tipoCurso === 'Educação a Distância (EAD)'
        ? 'Curso EAD'
        : 'Curso de Formação',
    curso_titulo: getTechnicalCourseTitle(formData.tipoCurso === 'Cursos Técnicos' ? 'Técnico em Enfermagem' : 'Curso de Formação'),
    carga_horaria: '1200',
    data_inicio: '04/12/2025',
    data_fim: '30/12/2025',
    periodo: '04/12/2025 até 30/12/2025',
    data_conclusao: '20 de Maio de 2026',
    data_conclusao_extenso: '20 de Maio de 2026',
    grade_curricular: `Anatomia Humana - 80h - Nota: 9.0\nFisiologia - 80h - Nota: 8.5\nPrimeiros Socorros - 40h - Nota: 10.0\nFarmacologia Aplicada - 60h - Nota: 9.5\nÉtica e Deontologia - 40h - Nota: 9.0\nEstágio Supervisionado I - 200h - Aprovado`,
    livro_registro: 'Livro: 12, Folha: 45, Registro: 1024',
    ensino_medio_estabelecimento: 'COLÉGIO ESTADUAL EXEMPLO',
    ensino_medio_localidade_uf: 'JAPOATÃ - SE',
    ensino_medio_ano_conclusao: '2022',
    certificado_numero: '1024',
    codigo_certificado: 'CERT-EAD-2B4F-D710-0F26',
    pagina_livro: '45',
    livro: '12',
    validacao_sistec: 'SE123456789',
    codigo_validacao: 'CERT-EAD-2B4F-D710-0F26',
    naturalidade: 'Japoatã/SE',
    data_nascimento: '10/02/2002',
    rg: '3.456.789 SSP/SE',
    eixo_tecnologico: 'ambiente e saúde',
    diretoria_geral_nome: 'NOME DA DIRETORA',
    diretoria_geral_cargo: 'Diretora Geral',
    secretaria_nome: 'NOME DA SECRETÁRIA',
    secretaria_cargo: 'Secretária Escolar'
  };
  const previewData = { ...defaultPreviewData, ...previewValues };

  const [assinaturas, setAssinaturas] = useState<AssinaturasData>(() => assinaturasService.getSignaturesSync());
  const signatureTemplateVars = {
    diretoria_geral_nome: assinaturas.diretoriaGeralNome || previewData.diretoria_geral_nome,
    diretoria_geral_cargo: assinaturas.diretoriaGeralCargo || previewData.diretoria_geral_cargo,
    secretaria_nome: assinaturas.secretariaNome || previewData.secretaria_nome,
    secretaria_cargo: assinaturas.secretariaCargo || previewData.secretaria_cargo,
  };

  // Helper para substituir variáveis simples por negrito no preview
  const parseText = (text: string, extraVars: Record<string, string> = {}) => {
    if (!text) return '';
    let parsed = text;
    Object.keys(previewData).forEach(key => {
       const regex = new RegExp(`{{${key}}}`, 'g');
       // @ts-ignore
       parsed = parsed.replace(regex, `<strong>${previewData[key]}</strong>`);
    });
    Object.keys(extraVars).forEach((key) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      parsed = parsed.replace(regex, `<strong>${extraVars[key]}</strong>`);
    });
    return highlightApprovalStatus(parsed);
  };

  const resolvePlainText = (text: string, extraVars: Record<string, string> = {}) => {
    if (!text) return '';
    let parsed = text;
    Object.keys(previewData).forEach(key => {
       const regex = new RegExp(`{{${key}}}`, 'g');
       // @ts-ignore
       parsed = parsed.replace(regex, previewData[key]);
    });
    Object.keys(extraVars).forEach((key) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      parsed = parsed.replace(regex, extraVars[key]);
    });
    return parsed;
  };

  const validationUrl = getDocumentValidationUrl(previewData.codigo_validacao);

  useEffect(() => {
    void assinaturasService.getSignatures().then((data) => {
      setAssinaturas(data);
    }).catch(() => {
      setAssinaturas(assinaturasService.getSignaturesSync());
    });
  }, []);

  const getSignatureUrl = (block: any) => {
    if (!block.signatureSource || block.signatureSource === 'none') {
      return block.signatureImageUrl || '';
    }
    if (block.signatureSource === 'manual') {
      return block.signatureImageUrl || '';
    }
    return assinaturas[block.signatureSource as keyof AssinaturasData] || '';
  };

  const zoomScale = zoomLevel / 100;
  const scaledPageFrameStyle: React.CSSProperties = {
    width: `${297 * zoomScale}mm`,
    height: `${210 * zoomScale}mm`,
    position: 'relative',
  };

  const containerStyle: React.CSSProperties = {
    transform: `scale(${zoomScale})`,
    transformOrigin: 'top left',
    backgroundColor: 'white',
    position: 'absolute',
    inset: 0,
  };

  const backgroundUrl = getTemplateBackgroundUrl(formData, page);
  const shouldRenderLandscapeWatermark =
    page === 'verso' && !backgroundUrl && Boolean(formData.landscapeWatermarkUrl);

  if (backgroundUrl) {
    containerStyle.backgroundImage = `url(${backgroundUrl})`;
    containerStyle.backgroundSize = 'cover';
    containerStyle.backgroundPosition = 'center';
  }

  const corTexto = formData.corTexto || '#1e293b';
  const blocks = getBlocks(formData);
  const visibleBlocks = blocks.filter((b: any) => b.page === page && b.visible);

  // LÓGICA DO DRAG & DROP EM PORCENTAGEM
  const handleDragStart = (e: React.MouseEvent, key: string) => {
    if (!isEditable) return;
    e.preventDefault();
    e.stopPropagation();
    
    if (onSelectBlock) {
      onSelectBlock(key);
    }
    
    // Obtém o elemento pai (o container do diploma A4)
    const canvasElement = e.currentTarget.parentElement;
    if (!canvasElement) return;
    
    const rect = canvasElement.getBoundingClientRect();
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;
    
    const block = blocks.find((b: any) => b.id === key);
    if (!block) return;
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = block.x; // em %
    const startTop = block.y; // em %

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      
      const zoomFactor = zoomLevel / 100;
      const actualDeltaX = deltaX / zoomFactor;
      const actualDeltaY = deltaY / zoomFactor;

      // Converte pixels reais de delta para porcentagem
      const pctDeltaX = (actualDeltaX / (canvasWidth / zoomFactor)) * 100;
      const pctDeltaY = (actualDeltaY / (canvasHeight / zoomFactor)) * 100;

      const newX = parseFloat(Math.min(95, Math.max(0, startLeft + pctDeltaX)).toFixed(2));
      const newY = parseFloat(Math.min(95, Math.max(0, startTop + pctDeltaY)).toFixed(2));

      const updatedBlocks = blocks.map((b: any) => {
        if (b.id === key) {
          return { ...b, x: newX, y: newY };
        }
        return b;
      });

      if (onChangeBlocks) {
        onChangeBlocks(updatedBlocks);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleRemoveBlock = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const updatedBlocks = blocks.map((b: any) => {
      if (b.id === key) {
        return { ...b, visible: false };
      }
      return b;
    });

    if (onChangeBlocks) {
      onChangeBlocks(updatedBlocks);
    }
    
    if (onSelectBlock && selectedBlockId === key) {
      onSelectBlock(null);
    }
  };

  const getPosStyle = (block: any): React.CSSProperties => {
    return {
      position: 'absolute',
      left: `${block.x}%`,
      top: `${block.y}%`,
      cursor: isEditable ? 'move' : 'default',
    };
  };

  const renderBlockContent = (block: any) => {
    switch (block.type) {
      case 'logo': {
        const logoW = `${block.width || 96}px`;
        return (
          <div 
            style={{ width: logoW, height: logoW }}
            className="flex items-center justify-center bg-[#001a33] rounded-full border-4 border-slate-200 shadow-sm"
          >
             <Award size={36} className="text-white" />
          </div>
        );
      }

      case 'text': {
        const textStyle: React.CSSProperties = {
          fontSize: `${block.fontSize || 14}px`,
          color: block.color || corTexto,
          width: `${block.width || 650}px`,
          fontFamily: block.fontFamily || (block.id === 'titulo' ? 'Playfair Display, serif' : block.id === 'texto' ? 'serif' : 'sans-serif'),
          textAlign: block.textAlign || (block.id === 'titulo' || block.id === 'subtitulo' || block.id === 'cidadeData' || block.id === 'texto' ? 'center' : 'left'),
          fontWeight: block.fontWeight || (block.id === 'titulo' ? '900' : block.id === 'subtitulo' || block.id === 'cidadeData' ? 'bold' : 'normal'),
          textTransform: block.id === 'titulo' || block.id === 'subtitulo' || block.id === 'cidadeData' ? 'uppercase' : 'none',
          lineHeight: block.lineHeight ?? (block.id === 'texto' ? '1.8' : 'normal'),
          letterSpacing: block.id === 'subtitulo' ? '0.3em' : 'normal'
        };
        
        return (
          <div style={textStyle}>
            <div dangerouslySetInnerHTML={{ __html: parseText(block.content || '', signatureTemplateVars) }} />
          </div>
        );
      }

      case 'signature': {
        const signatureW = `${block.width || 256}px`;
        const signatureLabelFontSize = Number(block.signatureLabelFontSize || 10);
        const signatureNameFontSize = Number(block.signatureNameFontSize || signatureLabelFontSize + 1);
        const signatureUrl = getSignatureUrl(block);
        const signatureBlend = block.signatureBlend !== false ? 'multiply' : 'normal';
        const signatureImageOffsetY = Number(block.signatureImageOffsetY || 0);
        const hasSeparateSignatureImage = visibleBlocks.some((item: any) => item.type === 'signatureImage' && item.signatureBlockId === block.id);
        const signerNameHtml = block.signerNameContent ? parseText(block.signerNameContent, signatureTemplateVars) : '';
        const signerTitleHtml = parseText(block.title || 'Visto', signatureTemplateVars);
        return (
          <div style={{ width: signatureW }} className="text-center flex flex-col items-center justify-end">
            {!hasSeparateSignatureImage && (
              <div className="flex h-[58px] w-full items-end justify-center overflow-visible">
                {signatureUrl ? (
                  <img
                    src={signatureUrl}
                    alt={block.title || 'Assinatura'}
                    className="w-full object-contain pointer-events-none"
                    style={{
                      maxHeight: '58px',
                      mixBlendMode: signatureBlend,
                      transform: `translateY(${signatureImageOffsetY}px)`,
                    }}
                  />
                ) : null}
              </div>
            )}
            <div
              className="w-full border-t border-slate-400 pt-[1px]"
              style={{ borderColor: block.color || corTexto }}
            >
              {signerNameHtml && (
                <p
                  className="font-black uppercase text-slate-800 leading-tight"
                  style={{ fontSize: `${signatureNameFontSize}px` }}
                  dangerouslySetInnerHTML={{ __html: signerNameHtml }}
                />
              )}
              <p
                className="font-black uppercase tracking-widest text-slate-800 leading-tight"
                style={{ fontSize: `${signatureLabelFontSize}px` }}
                dangerouslySetInnerHTML={{ __html: signerTitleHtml }}
              />
            </div>
          </div>
        );
      }

      case 'signatureImage': {
        const signatureImageUrl = getSignatureUrl(block);
        const signatureImageBlend = block.signatureBlend !== false ? 'multiply' : undefined;
        if (!signatureImageUrl) {
          return isEditable ? (
            <div
              className="flex items-center justify-center rounded border border-dashed border-purple-300 bg-purple-50/50 text-center text-[8px] font-black uppercase tracking-widest text-purple-500"
              style={{ width: `${block.width || 220}px`, height: '58px' }}
            >
              Imagem da assinatura
            </div>
          ) : null;
        }

        return (
          <img
            src={signatureImageUrl}
            alt={block.label || 'Assinatura'}
            draggable={false}
            className="block select-none object-contain pointer-events-none"
            style={{
              width: `${block.width || 220}px`,
              maxHeight: '90px',
              mixBlendMode: signatureImageBlend,
            }}
          />
        );
      }

      case 'line':
        return (
          <div
            style={{
              width: `${block.width || 260}px`,
              borderTop: `${block.borderWidth || 1}px solid ${block.color || corTexto}`,
            }}
          />
        );

      case 'qrcode': {
        const qrW = `${block.width || 120}px`;
        const qrSize = block.width || 120;
        if (block.id === 'qrcode') {
          return (
            <div style={{ width: qrW }} className="bg-white/90 p-2 rounded border border-slate-200 text-center shadow-sm">
              <p className="text-[7px] font-black uppercase tracking-widest text-slate-500">Código de Autenticidade</p>
              <p className="mt-1 break-all font-mono text-[9px] font-black text-[#001a33]">{previewData.codigo_validacao}</p>
            </div>
          );
        }
        return (
          <div style={{ width: qrW }} className="bg-white p-1 rounded border border-slate-200 flex flex-col items-center shadow-sm">
            <img
              src={getDocumentValidationQrUrl(previewData.codigo_validacao, qrSize * 2)}
              alt="QR de validação"
              className="w-full h-auto object-contain pointer-events-none"
            />
            <span className="text-[6px] font-black text-slate-400 mt-1 uppercase tracking-widest">Código: {previewData.codigo_validacao}</span>
          </div>
        );
      }

      case 'table': {
        const tableText = resolvePlainText(block.content || '');
        const programmaticRows = parseProgrammaticRows(tableText);
        const compactTable = programmaticRows.length > 6;
        const denseTable = programmaticRows.length > 10;
        const tableFontSize = Math.min(
          Number(block.fontSize || 11),
          denseTable ? 8 : compactTable ? 9 : 11
        );
        const tableCellClass = denseTable ? 'px-1.5 py-0.5' : compactTable ? 'px-1.5 py-1' : 'px-2 py-1.5';
        const tableTextStyle: React.CSSProperties = {
          color: block.color || corTexto,
          fontFamily: block.fontFamily || 'monospace',
          fontSize: `${tableFontSize}px`,
          textAlign: block.textAlign || 'left',
        };

        return (
          <div className="flex flex-col border border-slate-200 bg-white/90 rounded-xl" style={{ width: `${block.width || 550}px`, padding: denseTable ? '8px' : compactTable ? '10px' : '16px' }}>
            {block.tableTitleVisible !== false && (
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight border-b border-slate-800 pb-1.5 mb-3">
                Histórico Escolar
              </h2>
            )}
            {programmaticRows.length > 0 ? (
              <table className="w-full border-collapse overflow-hidden rounded-lg text-left" style={tableTextStyle}>
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className={`border border-slate-200 font-black uppercase tracking-widest ${tableCellClass}`}>Componente</th>
                    <th className={`w-20 border border-slate-200 font-black uppercase tracking-widest ${tableCellClass}`}>Carga</th>
                    <th className={`w-24 border border-slate-200 font-black uppercase tracking-widest ${tableCellClass}`}>Nota / Status</th>
                  </tr>
                </thead>
                <tbody>
                  {programmaticRows.map((row, index) => (
                    <tr key={`${row.nome}-${index}`} className={index % 2 === 0 ? 'bg-white/85' : 'bg-slate-50/85'}>
                      <td className={`border border-slate-200 font-bold ${tableCellClass}`}>{row.nome}</td>
                      <td className={`border border-slate-200 font-bold ${tableCellClass}`}>{row.carga}</td>
                      <td className={`border border-slate-200 font-black ${tableCellClass}`}>
                        {/aprovado/i.test(row.status) ? (
                          <span className="inline-block rounded-full bg-[#001a33] px-2 py-0.5 text-[0.78em] font-black uppercase tracking-widest text-white">Aprovado</span>
                        ) : (
                          row.status.replace(/^Nota:\s*/i, 'Nota: ')
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="leading-relaxed whitespace-pre-wrap" style={tableTextStyle}>
                <div dangerouslySetInnerHTML={{ __html: parseText(block.content || '') }} />
              </div>
            )}
          </div>
        );
      }

      case 'image':
        return block.imageUrl ? (
          <img
            src={block.imageUrl}
            alt=""
            draggable={false}
            style={{
              width: `${block.width || 180}px`,
              opacity: block.opacity ?? 1,
            }}
            className="block select-none object-contain"
          />
        ) : null;

      case 'registry':
        return (
          <div className="flex flex-col border border-slate-250 p-4 bg-white/95 rounded-xl w-[300px] shadow-sm">
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-tight border-b border-slate-800 pb-1.5 mb-3">
              Registro do Certificado
            </h2>
            <p className="text-[9px] font-bold text-slate-600 leading-relaxed">
              Certificado Expedido N° <b>{previewData.certificado_numero}</b>, lavrado à Página <b>{previewData.pagina_livro}</b> do Livro <b>{previewData.livro}</b>.
            </p>
            <p className="text-[9px] font-bold text-slate-600 mt-2">Validação do SISTEC: <b>{previewData.validacao_sistec}</b></p>
          </div>
        );

      case 'stamp':
        return (
          <div className="text-center flex flex-col items-center justify-center border border-slate-200 p-4 bg-white/90 rounded-xl w-[250px] shadow-sm">
            <div className="w-full border-b border-dotted border-slate-400 h-10 mb-1 flex items-center justify-center">
              <span className="text-[8px] text-slate-400 uppercase font-black opacity-30">Visto / Carimbo</span>
            </div>
          </div>
        );

      case 'validationLink':
        return (
          <div style={{ width: `${block.width || 560}px` }} className="p-1">
            <div
              className="font-black uppercase tracking-widest text-slate-700 leading-tight break-words"
              style={{
                fontSize: `${block.fontSize || 10}px`,
                color: block.color || corTexto,
                textAlign: block.textAlign || 'left',
                width: `${block.width || 560}px`,
              }}
              dangerouslySetInnerHTML={{ __html: parseText(block.content || '{{url_validacao}}', { ...signatureTemplateVars, url_validacao: validationUrl }) }}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className="relative shrink-0 transition-[width,height] duration-200"
      style={scaledPageFrameStyle}
    >
      <div
        className="bg-white w-[297mm] h-[210mm] shadow-2xl relative rounded-[2mm] overflow-hidden select-none"
        style={containerStyle}
      >
      {/* Marca d'água paisagem da empresa no verso, apenas quando não houver fundo próprio */}
      {shouldRenderLandscapeWatermark && (
        <div className="absolute inset-0 z-0 flex h-full w-full items-center justify-center overflow-hidden pointer-events-none">
          <img
            src={formData.landscapeWatermarkUrl}
            alt=""
            className="select-none object-contain"
            style={{
              width: `${formData.landscapeWatermarkScale || 55}%`,
              opacity: formData.landscapeWatermarkOpacity ?? 0.1,
              transform: formData.landscapeWatermarkRotate ? 'rotate(-22deg)' : 'none',
            }}
          />
        </div>
      )}

      {/* Renderização de todos os Blocos Visíveis da Página */}
      {visibleBlocks.map((block: any) => {
        const isSelected = selectedBlockId === block.id;
        const blockStyle = getPosStyle(block);

        if (block.type === 'signatureImage' && block.signatureBlend !== false) {
          blockStyle.mixBlendMode = 'multiply';
        }
        
        return (
          <div
            key={block.id}
            style={blockStyle}
            onMouseDown={(e) => handleDragStart(e, block.id)}
            onClick={(e) => {
              e.stopPropagation();
              if (isEditable && onSelectBlock) {
                onSelectBlock(block.id);
              }
            }}
            className={`z-20 ${
              isEditable
                ? `outline-2 outline-offset-2 transition-all group ${
                    isSelected 
                      ? 'outline outline-purple-600 ring-2 ring-purple-100' 
                      : 'hover:outline hover:outline-dashed hover:outline-slate-400'
                  }`
                : ''
            }`}
          >
            {renderBlockContent(block)}

            {/* Botão de Excluir Bloco (Apenas em Edição e se Selecionado/Hover) */}
            {isEditable && (
              <button
                onClick={(e) => handleRemoveBlock(e, block.id)}
                className="absolute -top-3.5 -right-3.5 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md border border-white opacity-0 group-hover:opacity-100 transition-opacity z-50 focus:outline-none"
                title="Excluir Elemento"
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
};

export default DiplomaPreview;
