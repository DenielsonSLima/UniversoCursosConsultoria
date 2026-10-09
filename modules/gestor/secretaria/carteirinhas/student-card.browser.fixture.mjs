export const student = {
  nome: 'ALUNA DE TESTE CARTEIRINHA', cpf: '123.456.789-09', rg: '12.345.678-X',
  tipoDocumento: 'RG (ANTIGO)', nascimento: '05/09/2000', matricula: 'UNIV-TESTE-123',
  curso: 'TÉCNICO EM ENFERMAGEM', instituicao: 'INSTITUIÇÃO DE TESTE',
  validade: '31/12/2028', validationCode: 'CIE-QA12-AB34-CD56', validationPublic: true,
  poloRazaoSocial: 'INSTITUIÇÃO EDUCACIONAL DE TESTE',
  poloCnpj: '00.000.000/0001-00', poloTelefone: '(79) 99999-0000',
};

export const model = {
  nome: 'Modelo sintético CR80', hasVerso: true, tipoCurso: 'Cursos Técnicos',
  usePhotoshopLayout: true, ocultarDesignPadrao: true, exibirRotulos: true,
  corPrimaria: '#0088cc', corSecundaria: '#e0f2fe', corTexto: '#1e293b',
  tamanhoFonteNome: 7.5, tamanhoFonteDados: 6.5, tamanhoFonteVerso: 5.2,
  tamanhoFonteDadosInstitucionais: 5.1, tamanhoFonteValidador: 5.5,
  fotoWidth: 18.5, fotoHeight: 44, assinaturaOrigem: 'manual',
  showAssinaturaAluno: false, showAssinaturaDiretor: true,
  assinaturaDiretorWidth: 25, mesclarAssinatura: true, textoDiretor: 'Direção Escolar',
  showTextoVerso: true, showInstitutionalData: true, showSiteValidador: true,
  showDataEmissao: true, showValidationCode: true,
  textoVerso: 'Documento de identificação estudantil emitido conforme o modelo oficial.\nUso pessoal e intransferível.\nVálido somente mediante apresentação de documento oficial com foto.',
  alinhamentoTextoVerso: 'left', dataEmissaoTexto: 'EMISSÃO: 02/01/2026',
  siteValidadorUrl: 'www.universocc.com.br/validador',
  posicoes: {
    foto: {x: 3.5, y: 23}, nome: {x: 25, y: 23}, curso: {x: 25, y: 39},
    rg: {x: 25, y: 53}, nascimento: {x: 62, y: 53}, cpf: {x: 25, y: 67},
    matricula: {x: 3.5, y: 84}, qrcode: {x: 57, y: 78},
    codigoValidacao: {x: 48, y: 97}, validade: {x: 71, y: 82},
    textoVerso: {x: 5, y: 20}, dadosInstitucionais: {x: 5, y: 57},
    assinaturaAluno: {x: 6, y: 76}, assinaturaDiretor: {x: 60, y: 78},
    assinaturaDiretorImagem: {x: 64, y: 59}, siteValidador: {x: 8, y: 94},
    dataEmissao: {x: 54, y: 88},
  },
};

export function createFixtureImages(createCanvas) {
  const make = (width, height, draw) => {
    const canvas = createCanvas(width, height);
    draw(canvas.getContext('2d'), width, height);
    return canvas.toDataURL('image/png');
  };
  const front = make(1000, 630, (ctx, w, h) => {
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = '#0284c7'; ctx.fillRect(0,0,w * 0.025,h);
    ctx.fillStyle = '#bae6fd'; ctx.fillRect(w * 0.85,0,w * 0.15,h * 0.1);
  });
  const back = make(1000, 630, (ctx, w, h) => {
    ctx.fillStyle = '#eff6ff'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = '#1d4ed8'; ctx.fillRect(0,0,w,h * 0.04);
    ctx.fillStyle = '#38bdf8'; ctx.fillRect(0,h * 0.97,w,h * 0.03);
  });
  const photo = make(120, 160, (ctx, w, h) => {
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = '#64748b'; ctx.beginPath(); ctx.arc(w/2,h/3,w/5,0,Math.PI*2); ctx.fill();
    ctx.fillRect(w/4,h/2,w/2,h/2);
  });
  const signature = make(240, 60, (ctx) => {
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(12,45); ctx.bezierCurveTo(80,2,130,55,226,12); ctx.stroke();
  });
  return {front, back, photo, signature};
}

export function measureCards() {
  return [...document.querySelectorAll('#cards .carteirinha-render-root')].map(card => {
    const bounds = card.getBoundingClientRect();
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    const texts = [];
    while(walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      const rects = [...range.getClientRects()].map(rect => ({
        x: (rect.x-bounds.x)/bounds.width*85.6,
        y: (rect.y-bounds.y)/bounds.height*54,
        width: rect.width/bounds.width*85.6, height: rect.height/bounds.height*54,
      }));
      texts.push({text: node.textContent, rects});
    }
    return {width: bounds.width, height: bounds.height, texts};
  });
}
