import { getBlocks, getTemplateBackgroundUrl } from './DiplomaPreview';

export type DiplomaEditorTab = 'visualizar' | 'frente' | 'verso';
export type DiplomaPreviewMode = 'frente' | 'verso' | 'ambos';

export const normalizeSignatureBlock = (block: any) => {
  if (block?.type !== 'signature') return block;

  const signatureDefaultSource = block.id === 'assinatura1'
    ? 'diretoriaGeral'
    : block.id === 'assinatura2'
      ? 'none'
      : 'none';
  const legacySource = ['secretaria', 'coordenacao', 'coordenação'].includes(block.signatureSource)
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
    signatureSource: legacySource ?? signatureDefaultSource,
    signatureImageUrl: block.signatureImageUrl || '',
    signatureBlend: block.signatureBlend ?? true,
    signatureImageOffsetY: Number(block.signatureImageOffsetY || 0),
    signatureLabelFontSize: block.signatureLabelFontSize != null ? Number(block.signatureLabelFontSize) : 10,
    label: block.id === 'assinatura2' ? 'Assinatura do(a) Aluno(a)' : block.label,
    title,
  };
};

export const buildBackgroundPatch = (page: 'frente' | 'verso', url: string, updatedAt = Date.now()) => {
  if (page === 'frente') {
    return {
      bgFrenteUrl: url,
      frenteUrl: url,
      backgroundFrenteUrl: url,
      bg_frente_url: url,
      bgFrenteUpdatedAt: updatedAt,
    };
  }

  return {
    bgVersoUrl: url,
    versoUrl: url,
    backgroundVersoUrl: url,
    bg_verso_url: url,
    bgVersoUpdatedAt: updatedAt,
  };
};

export const createInitialDiplomaData = (modelo: any) => {
  const data = modelo || {
    id: 'certificado_livre',
    nome: '',
    tipoCurso: 'Cursos Livres',
    status: 'ativo',
    hasVerso: true,
    hasWatermark: false,
    watermarkText: '',
    layout: 'classic',
    usePhotoshopLayout: true,
    ocultarDesignPadrao: true,
    bgFrenteUrl: '',
    bgVersoUrl: '',
    corTexto: '#1e293b',
    corPrimaria: '#001a33',
    corSecundaria: '#e2e8f0',
  };

  if (!data.blocks) {
    data.blocks = getBlocks(data);
  } else {
    data.blocks = getBlocks(data).map((block: any) => normalizeSignatureBlock(block));
  }
  data.usePhotoshopLayout = true;
  data.ocultarDesignPadrao = true;
  data.exibirBorda = false;
  return data;
};

const signatureSync = (block: any) => block ? block.visible : true;

export const buildFinalDiplomaData = (formData: any) => {
  const blocks = getBlocks(formData).map((block: any) => normalizeSignatureBlock(block));
  const findBlock = (id: string) => blocks.find((block: any) => block.id === id);
  const selo = findBlock('selo');
  const titulo = findBlock('titulo');
  const subtitulo = findBlock('subtitulo');
  const texto = findBlock('texto');
  const cidadeData = findBlock('cidadeData');
  const assinatura1 = findBlock('assinatura1');
  const assinatura2 = findBlock('assinatura2');
  const qrcode = findBlock('qrcode');
  const historico = findBlock('historico');
  const registro = findBlock('registro');
  const versoQrcode = findBlock('versoQrcode');
  const carimbo = findBlock('carimbo');
  const posicoes: any = {};
  blocks.forEach((block: any) => {
    posicoes[block.id] = { x: block.x, y: block.y };
  });

  return {
    ...formData,
    ...buildBackgroundPatch('frente', getTemplateBackgroundUrl(formData, 'frente'), formData.bgFrenteUpdatedAt || Date.now()),
    ...buildBackgroundPatch('verso', getTemplateBackgroundUrl(formData, 'verso'), formData.bgVersoUpdatedAt || Date.now()),
    blocks,
    posicoes,
    textoFrente: texto?.content || formData.textoFrente || '',
    textoVerso: historico?.content || formData.textoVerso || '',
    exibirLogo: selo ? selo.visible : true,
    exibirTitulo: titulo ? titulo.visible : true,
    exibirSubtitulo: subtitulo ? subtitulo.visible : true,
    exibirTexto: texto ? texto.visible : true,
    exibirCidadeData: cidadeData ? cidadeData.visible : true,
    exibirAssinatura1: assinatura1 ? signatureSync(assinatura1) : true,
    exibirAssinatura2: signatureSync(assinatura2),
    hasValidationQrCode: (qrcode?.visible || versoQrcode?.visible) ?? true,
    exibirVersoRegistro: registro ? registro.visible : true,
    exibirVersoCarimbo: carimbo ? carimbo.visible : true,
    tamanhoFonteTitulo: titulo?.fontSize || formData.tamanhoFonteTitulo || 45,
    tamanhoFonteSubtitulo: subtitulo?.fontSize || formData.tamanhoFonteSubtitulo || 14,
    tamanhoFonteTexto: texto?.fontSize || formData.tamanhoFonteTexto || 24,
    tamanhoFonteCidadeData: cidadeData?.fontSize || formData.tamanhoFonteCidadeData || 12,
    seloWidth: selo?.width || formData.seloWidth || 96,
    qrcodeWidth: qrcode?.width || formData.qrcodeWidth || 170,
    assinaturaWidth: assinatura1?.width || formData.assinaturaWidth || 256,
  };
};
