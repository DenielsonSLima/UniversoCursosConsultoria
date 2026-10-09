const syntheticBackground = 'data:image/png;base64,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';

export const syntheticModel = {
  id: 'certificado_ead',
  bgFrenteUrl: syntheticBackground, bgVersoUrl: syntheticBackground,
  tipoCurso: 'Educação a Distância (EAD)', hasVerso: true,
  ocultarDesignPadrao: true, hasValidationQrCode: true,
  exibirAssinatura1: false, exibirAssinatura2: false, exibirLogo: false,
  blocks: [
    { id: 'titulo', type: 'text', page: 'frente', visible: true, x: 8, y: 10,
      width: 850, fontSize: 36, content: 'Certificado', textAlign: 'center' },
    { id: 'texto', type: 'text', page: 'frente', visible: true, x: 10, y: 30,
      width: 850, fontSize: 22, content: '{{nome_aluno}} — CPF {{cpf}} — {{curso_nome}} — {{carga_horaria}} horas<br />Conforme a LDB nº 9.394/1996.<br />{{codigo_certificado}}' },
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
      styles: Object.fromEntries(styleKeys.map(key => [key, key === 'fontFamily'
        ? getComputedStyle(node)[key].replace(/["']?Universo EAD Inter["']?/g,'Inter').replace(/["']Inter["']/g,'Inter')
        : getComputedStyle(node)[key]])),
      image: node instanceof HTMLImageElement ? node.currentSrc : null,
    })),
  }));
});

export const certificateIdentityCases = [
  {id:'cpf-rg-raw',type:'RG (ANTIGO)',cpf:'12345678909',rg:'12.345.678-X',
    template:'CPF: <b>{{cpf}}</b>; RG nº <span>{{rg}}</span>',expected:['CPF: 123.456.789-09','RG nº 12.345.678-X']},
  {id:'cpf-rg-punctuated',type:'RG (ANTIGO)',cpf:'123.456.789-09',rg:'0012345X',
    template:'CPF nº <strong>{{cpf}}</strong>; RG: {{rg}}',expected:['CPF nº 123.456.789-09','RG: 0012345X']},
  {id:'cin-raw',type:'CIN',cpf:'12345678909',rg:'RG-RESIDUAL',
    template:'CPF: <b>{{cpf}}</b>',expected:['CIN: 123.456.789-09'],forbidden:['CPF:','RG-RESIDUAL']},
  {id:'cni-punctuated',type:'CNI',cpf:'123.456.789-09',rg:'RG-RESIDUAL',
    template:'<strong>CPF</strong> nº <span>{{cpf}}</span>',expected:['CIN nº 123.456.789-09'],forbidden:['CPF','RG-RESIDUAL']},
  {id:'ambiguous-legacy',type:'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',cpf:'12345678909',rg:'RG-ANTIGO',
    template:'CPF: <b>{{cpf}}</b>',expected:['CPF: 123.456.789-09'],forbidden:['CIN:']},
  {id:'explicit-null',type:'CIN',cpf:null,rg:'RG-RESIDUAL',
    template:'CPF: <b>{{cpf}}</b>',expected:['CIN:'],forbidden:['987.654.321-00','123.456.789-09','RG-RESIDUAL']},
];

export const withCertificateIdentityCase = (fixture, scenario) => {
  const original = fixture.model.blocks.find(block =>
    block.page === 'frente' && block.type === 'text' && String(block.content).includes('{{nome_aluno}}'));
  if (!original) throw Error('The configured front must have its actual student text block.');
  const identitySlot = /\bCPF\s*\{\{cpf\}\}/;
  if (!identitySlot.test(original.content)) throw Error('The real fixture must expose its existing CPF slot.');
  const content = original.content.replace(identitySlot, () => scenario.template);
  return {...fixture,
    certificate:{...fixture.certificate,
      aluno:{...fixture.certificate.aluno,cpf_cnpj:'98765432100',rg:'LIVE-RESIDUAL',tipo_documento:'RG (ANTIGO)'},
      metadados:{...fixture.certificate.metadados,studentDocumentType:scenario.type,studentCpf:scenario.cpf,
        studentRg:scenario.rg,studentRgIssuer:null,studentRgState:null,studentRgIssueDate:null},
    },
    model:{...fixture.model,blocks:fixture.model.blocks.map(block => block.id !== original.id ? block : {...block,
      content,
    })},
  };
};
