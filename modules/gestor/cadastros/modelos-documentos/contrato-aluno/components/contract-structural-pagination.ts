/** Estimativa exclusiva do editor; a paginação da emissão continua no backend. */
export const CONTRACT_STRUCTURAL_V4 = 'CONTRATO_A4_INSTITUCIONAL_V4_LEGIVEL';
export const STRUCTURAL_V4_LAYOUT = {
  firstBodyTopMm: 78,
  continuationBodyTopMm: 62,
  bodyWidthMm: 174,
  lineHeightMm: 12 * 25.4 / 72 * 1.25,
  firstLines: 37,
  continuationLines: 40,
  firstClosingLines: 23,
  continuationClosingLines: 26,
} as const;

export interface StructuralContractPage { body: string; footer: string | null }
type MeasureWord = (word: string) => number;
const widthPx = STRUCTURAL_V4_LAYOUT.bodyWidthMm * 96 / 25.4;

// Limites Times normal/negrito usados pelo estimador V4 (migration 123000).
// Aqui há folga de 4% e orçamento próprio: isto não pagina o PDF da emissão.
const widthGroups: Array<[string, number]> = [
  ['!()-:;[]`fjt¡¨¯´¸º', 330], ['"Sbdhknpquµßñùúûü', 550],
  ['#$*0123456789?J_agovxy¢£¤¥§«»¿àáâãäåòóôõöøÿ', 500], ['%WÆ', 1000],
  ['&m', 830], ["'/\\ilìíîï", 280], ['+<=>¬±÷', 570], [',.·', 250], ['@', 930],
  ['ACDNRUVXYwÀÁÂÃÄÅÇÑÙÚÛÜæ', 720], ['BELTZÈÉÊË', 660], ['FP', 610],
  ['GHKOQÒÓÔÕÖØ', 780], ['IsÌÍÎÏ', 390], ['M', 940], ['^', 580],
  ['cerzçèéêë', 440], ['{}', 480], ['|', 220], ['~ ¦­²³¶¹¼½¾Ð×ÝÞðýþ', 540],
  ['©®', 760], ['ª', 300], ['°', 401],
];
const glyphWidths = new Map(widthGroups.flatMap(([characters, width]) => (
  [...characters].map((character) => [character, width] as const)
)));
const measureWord: MeasureWord = (word) => [...word].reduce((width, character) => (
  width + (glyphWidths.get(character) ?? 1000) * 16 / 1000 * 1.04
), 0);

const estimateLines = (text: string, measure: MeasureWord) => text.split('\n').reduce((total, paragraph) => {
  let lines = 1;
  let used = 0;
  for (const word of paragraph.match(/\S+/gu) || []) {
    const width = measure(word);
    const gap = used ? 5.4 : 0;
    if (used && used + gap + width > widthPx) { lines += 1; used = 0; }
    const wordLines = Math.max(1, Math.ceil(width / widthPx));
    lines += wordLines - 1;
    used = wordLines > 1 ? width % widthPx : used + (used ? gap : 0) + width;
  }
  return total + lines;
}, 0);

export const estimateStructuralV4Lines = (text: string) => estimateLines(text, measureWord);

export const paginateStructuralV4 = (
  body: string, footer: string, hasQr: boolean,
): StructuralContractPage[] => {
  const measure = measureWord;
  const pages: StructuralContractPage[] = [];
  let current = '';
  const budget = () => pages.length ? STRUCTURAL_V4_LAYOUT.continuationLines : STRUCTURAL_V4_LAYOUT.firstLines;
  const flush = () => { pages.push({ body: current, footer: null }); current = ''; };
  const addParagraph = (paragraph: string) => {
    let remaining = paragraph.trim();
    while (remaining) {
      const candidate = current ? `${current}\n\n${remaining}` : remaining;
      if (estimateLines(candidate, measure) <= budget()) { current = candidate; return; }
      if (current) { flush(); continue; }
      // Um parágrafo grande não pode ficar inteiro em uma folha e ser cortado.
      let low = 1;
      let high = remaining.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (estimateLines(remaining.slice(0, mid), measure) <= budget()) low = mid;
        else high = mid - 1;
      }
      let split = low;
      if (!/\s/u.test(remaining[split] || '')) {
        const lastSpace = remaining.slice(0, split).search(/\s+\S*$/u);
        if (lastSpace > 0) split = lastSpace;
      }
      current = remaining.slice(0, split).trim();
      remaining = remaining.slice(split).trim();
      flush();
    }
  };
  const sections = body.split(/<div[^>]*data-page-break=["']true["'][\s\S]*?<\/div>|---QUEBRA_DE_PAGINA---/gi);
  sections.forEach((section, index) => {
    if (index && current) flush();
    section.split(/\n[\t ]*\n/u).forEach(addParagraph);
  });
  if (current || !pages.length) flush();
  if (footer || hasQr) {
    const lastPage = pages[pages.length - 1];
    const closingBudget = pages.length === 1
      ? STRUCTURAL_V4_LAYOUT.firstClosingLines : STRUCTURAL_V4_LAYOUT.continuationClosingLines;
    if (estimateLines(lastPage.body, measure) > closingBudget) pages.push({ body: '', footer: footer || null });
    else lastPage.footer = footer || null;
  }
  return pages;
};
