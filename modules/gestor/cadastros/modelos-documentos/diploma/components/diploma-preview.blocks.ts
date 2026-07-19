import {
  EAD_BACK_LEGAL_TEXT,
  EAD_BACK_TEXT,
  EAD_BACK_TITLE_TEXT,
  EAD_FRONT_TEXT,
  EAD_VALIDITY_TEXT,
  PRESENTIAL_BACK_LEGAL_TEXT,
  PRESENTIAL_FRONT_TEXT,
  PRESENTIAL_VALIDITY_TEXT,
  TECHNICAL_FRONT_TEXT,
  isEadCertificate,
  isPresentialProfessionalCertificate,
  isTechnicalCertificate,
  posicoesPadrao,
  usesProgrammaticBackLayout,
  validationSiteContent,
} from './diploma-preview.model';
import { normalizeLegacyBlock } from './diploma-preview.normalization';

const buildTechnicalBackBlocks = (formData: any, pos: Record<string, any>) => {
  const technical = isTechnicalCertificate(formData);
  const textBlock = (
    id: string,
    label: string,
    content: string,
    options: Record<string, any> = {},
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

  return [
    textBlock('versoObservacaoTitulo', 'Observação', 'OBSERVAÇÃO:', { width: 300, fontSize: 14 }),
    textBlock('versoOrgaoTitulo', 'Órgão de Fiscalização', 'ÓRGÃO DE FISCALIZAÇÃO PROFISSIONAL:', { width: 500, fontSize: 14 }),
    textBlock('versoAlunoNome', 'Nome do Aluno', '{{nome_aluno}}', { width: 760, color: '#dc2626', fontSize: 14, textAlign: 'center' }),
    textBlock('versoEnsinoMedioTitulo', 'Ensino Médio', 'ENSINO MÉDIO', { width: 760, fontSize: 14, textAlign: 'center' }),
    textBlock('versoEnsinoMedioEstabelecimento', 'Ensino Médio - Estabelecimento', 'ESTABELECIMENTO: {{ensino_medio_estabelecimento}}', { width: 820, fontSize: 13 }),
    textBlock('versoEnsinoMedioLocalidade', 'Ensino Médio - Localidade', 'LOCALIDADE DA UNIDADE FEDERAÇÃO: {{ensino_medio_localidade_uf}}', { width: 820, fontSize: 13 }),
    textBlock('versoEnsinoMedioAno', 'Ensino Médio - Ano', 'ANO DE CONCLUSÃO: {{ensino_medio_ano_conclusao}}', { width: 820, fontSize: 13 }),
    textBlock('versoRegistroTexto', 'Registro do Certificado', 'Certificado Expedido N° {{certificado_numero}} lavrado à Página {{pagina_livro}} do Livro {{livro}}.', { width: 470, fontSize: 12, fontWeight: '700' }),
    textBlock('versoSistecTexto', 'Validação do SISTEC', 'Validação do SISTEC: {{validacao_sistec}}', { width: 360, fontSize: 12, fontWeight: '700' }),
    textBlock('versoDataTexto', 'Data de Expedição', '{{cidade_uf}}, {{data_conclusao_extenso}}.', { width: 350, fontSize: 12, textAlign: 'center' }),
    {
      id: 'versoSecretariaAssinaturaImagem', type: 'signatureImage', label: 'Assinatura Secretaria Escolar', page: 'verso',
      x: pos.versoSecretariaAssinaturaImagem?.x ?? posicoesPadrao.versoSecretariaAssinaturaImagem.x,
      y: pos.versoSecretariaAssinaturaImagem?.y ?? posicoesPadrao.versoSecretariaAssinaturaImagem.y,
      width: 210, signatureSource: 'secretaria', signatureImageUrl: '', signatureBlend: true,
      visible: technical && formData.hasVerso !== false,
    },
    {
      id: 'versoDiretoraAssinaturaImagem', type: 'signatureImage', label: 'Assinatura Diretoria Geral', page: 'verso',
      x: pos.versoDiretoraAssinaturaImagem?.x ?? posicoesPadrao.versoDiretoraAssinaturaImagem.x,
      y: pos.versoDiretoraAssinaturaImagem?.y ?? posicoesPadrao.versoDiretoraAssinaturaImagem.y,
      width: 210, signatureSource: 'diretoriaGeral', signatureImageUrl: '', signatureBlend: true,
      visible: technical && formData.hasVerso !== false,
    },
    {
      id: 'versoSecretariaLinha', type: 'line', label: 'Linha Assinatura Secretaria', page: 'verso',
      x: pos.versoSecretariaLinha?.x ?? posicoesPadrao.versoSecretariaLinha.x,
      y: pos.versoSecretariaLinha?.y ?? posicoesPadrao.versoSecretariaLinha.y,
      width: 310, color: formData.corTexto || '#111827', borderWidth: 1,
      visible: technical && formData.hasVerso !== false,
    },
    {
      id: 'versoDiretoraLinha', type: 'line', label: 'Linha Assinatura Diretoria', page: 'verso',
      x: pos.versoDiretoraLinha?.x ?? posicoesPadrao.versoDiretoraLinha.x,
      y: pos.versoDiretoraLinha?.y ?? posicoesPadrao.versoDiretoraLinha.y,
      width: 310, color: formData.corTexto || '#111827', borderWidth: 1,
      visible: technical && formData.hasVerso !== false,
    },
    textBlock('versoSecretariaEscolar', 'Secretária Escolar', '{{secretaria_nome}}<br />{{secretaria_cargo}}', { width: 310, fontSize: 12, textAlign: 'center', lineHeight: 1.08 }),
    textBlock('versoDiretoraGeral', 'Diretora Geral', '{{diretoria_geral_nome}}<br />{{diretoria_geral_cargo}}', { width: 310, fontSize: 12, textAlign: 'center', lineHeight: 1.08 }),
  ];
};

export const getBlocks = (formData: any) => {
  const pos = formData.posicoes || posicoesPadrao;
  const technical = isTechnicalCertificate(formData);
  const ead = isEadCertificate(formData);
  const presentialProfessional = isPresentialProfessionalCertificate(formData);
  const programmaticBackLayout = usesProgrammaticBackLayout(formData);
  const sourceBlocks = Array.isArray(formData.blocks) ? formData.blocks : [];
  const existingSignature = (id: string) => sourceBlocks.find((block: any) => block.id === id && block.type === 'signature') || {};
  const defaultBlocks = [
    {
      id: 'selo', type: 'logo', label: 'Selo / Logomarca', page: 'frente',
      x: pos.selo?.x ?? posicoesPadrao.selo.x, y: pos.selo?.y ?? posicoesPadrao.selo.y,
      width: formData.seloWidth || 96, visible: formData.exibirLogo !== false,
    },
    {
      id: 'titulo', type: 'text', label: 'Título Principal', page: 'frente',
      x: pos.titulo?.x ?? posicoesPadrao.titulo.x, y: pos.titulo?.y ?? posicoesPadrao.titulo.y,
      fontSize: formData.tamanhoFonteTitulo || 45, width: 650, color: formData.corTexto || '#1e293b',
      fontFamily: "'Playfair Display', serif", fontWeight: '900', textAlign: 'center', content: 'Certificado',
      visible: formData.exibirTitulo !== false,
    },
    {
      id: 'subtitulo', type: 'text', label: 'Subtítulo', page: 'frente',
      x: pos.subtitulo?.x ?? posicoesPadrao.subtitulo.x, y: pos.subtitulo?.y ?? posicoesPadrao.subtitulo.y,
      fontSize: formData.tamanhoFonteSubtitulo || 14, width: 650, color: formData.corTexto || '#1e293b',
      fontFamily: 'sans-serif', fontWeight: '700', textAlign: 'center', content: 'De Conclusão de Curso',
      visible: formData.exibirSubtitulo !== false,
    },
    {
      id: 'texto', type: 'text', label: 'Texto Descritivo', page: 'frente',
      x: pos.texto?.x ?? posicoesPadrao.texto.x, y: pos.texto?.y ?? posicoesPadrao.texto.y,
      fontSize: formData.tamanhoFonteTexto || 24, width: 650, color: formData.corTexto || '#1e293b',
      fontFamily: 'serif', fontWeight: '400', textAlign: 'center',
      content: formData.textoFrente || (technical ? TECHNICAL_FRONT_TEXT : ead ? EAD_FRONT_TEXT : presentialProfessional ? PRESENTIAL_FRONT_TEXT : 'Certificamos que {{nome_aluno}} concluiu o curso de {{curso_nome}} com carga horária de {{carga_horaria}} horas.'),
      visible: formData.exibirTexto !== false,
    },
    {
      id: 'cidadeData', type: 'text', label: 'Cidade e Data', page: 'frente',
      x: pos.cidadeData?.x ?? posicoesPadrao.cidadeData.x, y: pos.cidadeData?.y ?? posicoesPadrao.cidadeData.y,
      fontSize: formData.tamanhoFonteCidadeData || 12, width: 650, color: formData.corTexto || '#1e293b',
      fontFamily: 'sans-serif', fontWeight: '700', textAlign: 'center', content: '{{cidade_uf}}, {{data_conclusao}}',
      visible: formData.exibirCidadeData !== false,
    },
    {
      id: 'validadeNacional', type: 'text', label: 'Validade Nacional', page: 'verso',
      x: pos.validadeNacional?.x ?? posicoesPadrao.validadeNacional.x,
      y: pos.validadeNacional?.y ?? posicoesPadrao.validadeNacional.y,
      fontSize: 13, width: 520, color: formData.corTexto || '#1e293b', fontFamily: 'serif',
      fontWeight: '400', textAlign: 'center',
      content: presentialProfessional ? PRESENTIAL_VALIDITY_TEXT : EAD_VALIDITY_TEXT,
      visible: programmaticBackLayout && formData.hasVerso !== false,
    },
    {
      id: 'assinatura1', type: 'signature', label: 'Assinatura Diretor', page: 'frente',
      x: pos.assinatura1?.x ?? posicoesPadrao.assinatura1.x, y: pos.assinatura1?.y ?? posicoesPadrao.assinatura1.y,
      width: formData.assinaturaWidth || 256, signerNameContent: technical ? '{{diretoria_geral_nome}}' : undefined,
      title: technical ? '{{diretoria_geral_cargo}}' : 'Diretor Geral', signatureSource: 'diretoriaGeral',
      signatureImageUrl: '', signatureBlend: true, signatureImageOffsetY: 0,
      signatureNameFontSize: technical ? 11 : undefined, signatureLabelFontSize: technical ? 9 : 10,
      visible: formData.exibirAssinatura1 !== false,
    },
    {
      id: 'assinatura1Imagem', type: 'signatureImage', label: 'Imagem Assinatura Diretor', page: 'frente',
      signatureBlockId: 'assinatura1', x: pos.assinatura1Imagem?.x ?? posicoesPadrao.assinatura1Imagem.x,
      y: pos.assinatura1Imagem?.y ?? posicoesPadrao.assinatura1Imagem.y,
      width: existingSignature('assinatura1').signatureImageWidth || 220,
      signatureSource: existingSignature('assinatura1').signatureSource || 'diretoriaGeral',
      signatureImageUrl: existingSignature('assinatura1').signatureImageUrl || '',
      signatureBlend: existingSignature('assinatura1').signatureBlend ?? true,
      visible: formData.exibirAssinatura1 !== false,
    },
    {
      id: 'assinatura2', type: 'signature', label: 'Assinatura do(a) Aluno(a)', page: 'frente',
      x: pos.assinatura2?.x ?? posicoesPadrao.assinatura2.x, y: pos.assinatura2?.y ?? posicoesPadrao.assinatura2.y,
      width: formData.assinaturaWidth || 256, signerNameContent: technical ? '{{nome_aluno}}' : undefined,
      title: technical ? 'Titular do Diploma' : 'Aluno(a)', signatureNameFontSize: technical ? 11 : undefined,
      signatureLabelFontSize: technical ? 9 : undefined, visible: formData.exibirAssinatura2 !== false,
    },
    {
      id: 'assinatura2Imagem', type: 'signatureImage', label: 'Imagem Assinatura Aluno(a)', page: 'frente',
      signatureBlockId: 'assinatura2', x: pos.assinatura2Imagem?.x ?? posicoesPadrao.assinatura2Imagem.x,
      y: pos.assinatura2Imagem?.y ?? posicoesPadrao.assinatura2Imagem.y,
      width: existingSignature('assinatura2').signatureImageWidth || 220,
      signatureSource: existingSignature('assinatura2').signatureSource || 'none',
      signatureImageUrl: existingSignature('assinatura2').signatureImageUrl || '',
      signatureBlend: existingSignature('assinatura2').signatureBlend ?? true, visible: false,
    },
    {
      id: 'qrcode', type: 'qrcode', label: 'QR Code Autenticidade', page: 'frente',
      x: pos.qrcode?.x ?? posicoesPadrao.qrcode.x, y: pos.qrcode?.y ?? posicoesPadrao.qrcode.y,
      width: formData.qrcodeWidth || 170, visible: !technical && formData.hasValidationQrCode !== false,
    },
    {
      id: 'validacaoSite', type: 'validationLink', label: 'Site de Validação', page: 'verso',
      x: pos.validacaoSite?.x ?? posicoesPadrao.validacaoSite.x, y: pos.validacaoSite?.y ?? posicoesPadrao.validacaoSite.y,
      width: 560, color: formData.corTexto || '#1e293b', fontSize: 10, fontFamily: 'sans-serif',
      textAlign: 'left', content: validationSiteContent, visible: formData.hasVerso !== false,
    },
    ...buildTechnicalBackBlocks(formData, pos),
    {
      id: 'conteudoProgramaticoTitulo', type: 'text', label: 'Título Conteúdo Programático', page: 'verso',
      x: pos.conteudoProgramaticoTitulo?.x ?? posicoesPadrao.conteudoProgramaticoTitulo.x,
      y: pos.conteudoProgramaticoTitulo?.y ?? posicoesPadrao.conteudoProgramaticoTitulo.y,
      width: 560, color: formData.corTexto || '#1e293b', fontSize: 15, fontFamily: 'sans-serif',
      fontWeight: '900', textAlign: 'left', content: EAD_BACK_TITLE_TEXT,
      visible: programmaticBackLayout && formData.hasVerso !== false,
    },
    {
      id: 'historico', type: 'table', label: 'Histórico Escolar / Grade', page: 'verso',
      x: pos.historico?.x ?? posicoesPadrao.historico.x, y: pos.historico?.y ?? posicoesPadrao.historico.y,
      width: 560, fontSize: 11, color: formData.corTexto || '#1e293b', fontFamily: 'monospace',
      textAlign: 'left', tableTitleVisible: !programmaticBackLayout,
      content: formData.textoVerso || (formData.tipoCurso === 'Cursos Técnicos' ? 'Grade Curricular do Curso:\n\n{{grade_curricular}}' : programmaticBackLayout ? EAD_BACK_TEXT : 'Conteúdo Programático:\n\n{{grade_curricular}}'),
      visible: formData.hasVerso !== false,
    },
    {
      id: 'cursosLivresLegal', type: 'text', label: 'Base Legal Cursos Livres', page: 'verso',
      x: pos.cursosLivresLegal?.x ?? posicoesPadrao.cursosLivresLegal.x,
      y: pos.cursosLivresLegal?.y ?? posicoesPadrao.cursosLivresLegal.y,
      width: 560, color: formData.corTexto || '#1e293b', fontSize: 11, fontFamily: 'sans-serif',
      fontWeight: '900', textAlign: 'left',
      content: presentialProfessional ? PRESENTIAL_BACK_LEGAL_TEXT : EAD_BACK_LEGAL_TEXT,
      visible: programmaticBackLayout && formData.hasVerso !== false,
    },
    {
      id: 'registro', type: 'registry', label: 'Livro de Registro', page: 'verso',
      x: pos.registro?.x ?? posicoesPadrao.registro.x, y: pos.registro?.y ?? posicoesPadrao.registro.y,
      visible: technical && formData.exibirVersoRegistro !== false,
    },
    {
      id: 'versoQrcode', type: 'qrcode', label: 'QR Code Verso', page: 'verso',
      x: pos.versoQrcode?.x ?? posicoesPadrao.versoQrcode.x, y: pos.versoQrcode?.y ?? posicoesPadrao.versoQrcode.y,
      width: formData.qrcodeWidth || 170, visible: formData.hasValidationQrCode !== false,
    },
    {
      id: 'carimbo', type: 'stamp', label: 'Carimbo / Visto', page: 'verso',
      x: pos.carimbo?.x ?? posicoesPadrao.carimbo.x, y: pos.carimbo?.y ?? posicoesPadrao.carimbo.y,
      visible: technical && formData.exibirVersoCarimbo !== false,
    },
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
