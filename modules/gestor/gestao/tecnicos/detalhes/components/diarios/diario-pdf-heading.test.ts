import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { drawCanonicalInstitutionalHeader } from '../../../../../secretaria/shared/canonical-institutional-header-pdf.ts';
import { createSnapshot, loadAssets } from './diario-pdf-server-boundary.fixtures.ts';
import { composeDiarioPdfWithManifest } from './diario-pdf.ts';

declare const Deno: { test: (name: string, fn: () => void | Promise<void>) => void };

Deno.test('títulos do diário usam texto central sem retângulo e outros documentos preservam cartão', () => {
  const render = (appearance?: 'plain') => {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const rectangleHeights: number[] = [];
    const original = pdf.roundedRect;
    pdf.roundedRect = function (x, y, w, h, rx, ry, style) {
      rectangleHeights.push(h);
      return original.call(this, x, y, w, h, rx, ry, style);
    };
    const result = drawCanonicalInstitutionalHeader(pdf, createSnapshot().institutionalIdentity.institution, null, {
      orientation: 'landscape', metaAppearance: appearance,
      meta: { eyebrow: 'DIÁRIO DE CLASSE', title: 'CONTEÚDO PROGRAMÁTICO E PRÁTICA PEDAGÓGICA', label: 'PÁGINA', value: 'Conteúdo 1' },
    });
    const commands = (pdf.internal as unknown as { pages: string[][] }).pages[1].join('\n');
    return { rectangleHeights, result, commands };
  };
  const plain = render('plain');
  const card = render();
  assert.ok(!plain.rectangleHeights.includes(10.5));
  assert.ok(card.rectangleHeights.includes(10.5));
  assert.equal(plain.result.contentTop, card.result.contentTop, 'A mudança visual preserva a área da tabela');
  assert.match(plain.commands, /12 Tf/u);
  assert.match(plain.commands, /\(DIÁRIO DE CLASSE\) Tj/u);
  assert.match(plain.commands, /\(CONTEÚDO PROGRAMÁTICO E PRÁTICA PEDAGÓGICA\) Tj/u);
});

Deno.test('identificação do diário fica discreta no canto inferior direito e não no topo', async () => {
  const snapshot = createSnapshot();
  snapshot.template.imprimirInstrucoes = false;
  const built = await composeDiarioPdfWithManifest(snapshot, await loadAssets());
  const page = (built.pdf.internal as unknown as { pages: string[][] }).pages.slice(1)
    .find((commands) => commands.some((command) => command.includes('(Diário de classe · Conteúdo 1)')))!;
  assert.ok(page, 'A página de conteúdo identifica o diário no rodapé');
  assert.ok(!page.join('\n').includes('(DIÁRIO DE CLASSE) Tj'), 'Não há identificação repetida no cabeçalho');
  const footer = page.find((command) => command.includes('(Diário de classe · Conteúdo 1)'))!;
  const position = footer.match(/([\d.]+) ([\d.]+) Td\n\(Diário de classe/u);
  assert.ok(position, 'O texto usa posição vetorial nativa');
  assert.ok(Number(position[1]) > 600 && Number(position[2]) < 20, 'O texto fica no canto inferior direito');
});
