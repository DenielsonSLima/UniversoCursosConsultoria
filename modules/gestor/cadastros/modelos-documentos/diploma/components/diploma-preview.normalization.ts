import {
  EAD_BACK_TEXT,
  EAD_FRONT_TEXT,
  EAD_VALIDITY_TEXT,
  PRESENTIAL_FRONT_TEXT,
  PRESENTIAL_VALIDITY_TEXT,
  TECHNICAL_FRONT_TEXT,
  isEadCertificate,
  isPresentialProfessionalCertificate,
  isTechnicalCertificate,
  posicoesPadrao,
  technicalValidationSiteContent,
  usesProgrammaticBackLayout,
  validationSiteContent,
} from './diploma-preview.model';

const normalizeSignatureBlock = (block: any) => {
  if (block?.type !== 'signature') return block;

  const signatureDefaultSource = block.id === 'assinatura1' ? 'diretoriaGeral' : 'none';
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

export const normalizeLegacyBlock = (block: any, formData: any) => {
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
    normalized = { ...normalized, content: TECHNICAL_FRONT_TEXT };
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
    normalized = { ...normalized, signerNameContent: '{{nome_aluno}}', title: 'Titular do Diploma' };
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
      y: isOldDefaultPosition
        ? posicoesPadrao.versoValidadorSite.y
        : Number(normalized.y) > 95 ? posicoesPadrao.validacaoSite.y : normalized.y ?? posicoesPadrao.validacaoSite.y,
      width: technical ? 250 : normalized.width,
      fontSize: technical ? 7 : normalized.fontSize,
      textAlign: technical ? 'center' : normalized.textAlign,
      content: technical ? technicalValidationSiteContent : validationSiteContent,
      visible: formData.hasVerso !== false,
    };
  }

  return normalized;
};
