export const syntheticModel = {
  id: 'certificado_ead',
  tipoCurso: 'Educação a Distância (EAD)', hasVerso: true,
  ocultarDesignPadrao: true, hasValidationQrCode: true,
  exibirAssinatura1: false, exibirAssinatura2: false, exibirLogo: false,
  blocks: [
    { id: 'titulo', type: 'text', page: 'frente', visible: true, x: 8, y: 10,
      width: 850, fontSize: 36, content: 'Certificado', textAlign: 'center' },
    { id: 'texto', type: 'text', page: 'frente', visible: true, x: 10, y: 30,
      width: 850, fontSize: 22, content: '{{nome_aluno}} — {{curso_nome}} — {{carga_horaria}} horas<br />{{codigo_certificado}}' },
    { id: 'cidadeData', type: 'text', page: 'frente', visible: true, x: 10, y: 70,
      width: 850, fontSize: 16, content: '{{data_conclusao}}' },
    { id: 'conteudoProgramaticoTitulo', type: 'text', page: 'verso', visible: true,
      x: 13.3, y: 9.25, width: 560, fontSize: 32, content: 'CONTEÚDO PROGRAMÁTICO' },
    { id: 'historico', type: 'table', page: 'verso', visible: true, x: 12.67, y: 25.37,
      width: 705, fontSize: 16, fontFamily: 'serif', tableTitleVisible: false,
      content: '{{grade_curricular}}' },
    { id: 'versoQrcode', type: 'qrcode', page: 'verso', visible: true,
      x: 78.54, y: 35.93, width: 190 },
  ],
};

export const syntheticIdentity = {
  aluno: { nome: 'ALUNO SINTÉTICO DE VALIDAÇÃO', cpf_cnpj: '00000000000' },
  curso: { nome: 'Curso de validação EAD', carga_horaria: 999 },
  turma: { nome: 'Turma sintética', codigo: 'TESTE' },
  polo: { nome: 'Polo sintético', cidade: 'Japoatã', estado: 'SE' },
};

export const signatureFixtureModule = `
  export const assinaturasService = {
    getSignaturesSync: () => (window.__fixture.signatures || {}),
    getSignatures: async () => (window.__fixture.signatures || {}),
  };
`;

// Runs inside Chromium. Compare document coordinates independently of viewport scale.
export const measureCertificatePages = (selectors) => selectors.map(selector => {
  const root = document.querySelector(selector);
  const origin = root.getBoundingClientRect();
  const scale = origin.width / parseFloat(getComputedStyle(root).width);
  const box = node => {
    const rect = node.getBoundingClientRect();
    return [rect.x - origin.x, rect.y - origin.y, rect.width, rect.height]
      .map(value => Math.round(value / scale * 1000) / 1000);
  };
  const styleKeys = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
    'letterSpacing', 'textTransform', 'textAlign', 'color', 'borderWidth',
    'borderRadius', 'padding', 'opacity'];
  return [...root.children].filter(node => getComputedStyle(node).position === 'absolute').map(block => ({
    geometry: box(block), text: block.textContent,
    elements: [...block.querySelectorAll('*')].map(node => ({
      tag: node.tagName, geometry: box(node), text: node.childElementCount ? null : node.textContent,
      styles: Object.fromEntries(styleKeys.map(key => [key, getComputedStyle(node)[key]])),
      image: node instanceof HTMLImageElement ? node.currentSrc : null,
    })),
  }));
});
