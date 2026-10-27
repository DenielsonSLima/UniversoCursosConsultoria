export const sources = [
  {
    id: 'mb-obmep-operacoes',
    title: 'IMPA / Portal da OBMEP — Operações básicas',
    url: 'https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=60',
  },
  {
    id: 'mb-obmep-fracoes',
    title: 'IMPA / Portal da OBMEP — Frações, o Primeiro Contato',
    url: 'https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=28',
  },
  {
    id: 'mb-obmep-proporcoes',
    title: 'IMPA / Portal da OBMEP — Razões e Proporções',
    url: 'https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=57',
  },
  {
    id: 'mb-obmep-percentual-probabilidade',
    title: 'IMPA / Portal da OBMEP — Fração como Porcentagem e como Probabilidade',
    url: 'https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=36&tipo=7',
  },
  {
    id: 'mb-obmep-geometria',
    title: 'IMPA / Portal da OBMEP — Elementos Básicos de Geometria Plana, Parte 1',
    url: 'https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=17',
  },
  {
    id: 'mb-obmep-medidas',
    title: 'IMPA / Portal da OBMEP — Unidades de Medida de Comprimento e de Áreas',
    url: 'https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=54',
  },
  {
    id: 'mb-obmep-estatistica',
    title: 'IMPA / Portal da OBMEP — Noções Básicas de Estatística',
    url: 'https://portaldaobmep.impa.br/index.php/modulo/ver?modulo=64',
  },
  {
    id: 'mb-mec-bncc',
    title: 'Ministério da Educação — Base Nacional Comum Curricular',
    url: 'https://basenacionalcomum.mec.gov.br/images/BNCC_EI_EF_110518_versaofinal_site.pdf',
  },
];

export function referenceHtml(sourceIds) {
  const selected = sourceIds.map((id) => sources.find((source) => source.id === id));
  if (selected.some((source) => !source)) throw new Error('Referência de Matemática Básica não encontrada.');
  return '<h3>Para aprofundar</h3><p>Texto e problemas desta aula são originais. '
    + 'Consulte também os materiais institucionais de estudo:</p><ul>'
    + selected.map(({ title, url }) => `<li><a href="${url}">${title}</a></li>`).join('')
    + '</ul>';
}
