import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { combineVectorPdfBlobs } from './carnes-alunos.pdf.ts';

const vectorPdf = async (label: string, pages = 1) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
    const page = pdf.addPage([300, 200]);
    page.drawText(`${label} - página ${pageIndex + 1}`, { x: 25, y: 100, font, size: 14 });
  }
  return new Blob([Uint8Array.from(await pdf.save()).buffer], { type: 'application/pdf' });
};

test('um único documento reutiliza exatamente o Blob retornado pelo Banese', async () => {
  const original = await vectorPdf('Carnê individual');
  const combined = await combineVectorPdfBlobs([original]);
  assert.equal(combined, original);
});

test('fusão respeita AbortSignal antes de reutilizar ou abrir PDFs', async () => {
  const controller = new globalThis.AbortController();
  controller.abort();
  await assert.rejects(
    () => combineVectorPdfBlobs([new Blob(['pdf'], { type: 'application/pdf' })], controller.signal),
    (failure: unknown) => failure instanceof Error && failure.name === 'AbortError',
  );
});

test('lote copia páginas vetoriais em ordem sem rasterização', async () => {
  const first = await vectorPdf('Primeiro', 2);
  const second = await vectorPdf('Segundo', 1);
  const combined = await combineVectorPdfBlobs([first, second]);
  const loaded = await PDFDocument.load(await combined.arrayBuffer());
  assert.equal(loaded.getPageCount(), 3);
  assert.equal(combined.type, 'application/pdf');

  const source = await readFile(new URL('./carnes-alunos.pdf.ts', import.meta.url), 'utf8');
  assert.match(source, /copyPages/);
  assert.doesNotMatch(source, /html2canvas|toDataURL|addImage|drawImage/);
});

test('visualizador reutiliza o Blob preparado em prévia, download e impressão', async () => {
  const source = await readFile(
    new URL('./components/CarnesDocumentPreviewModal.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /createObjectURL\(preparedDocument\.blob\)/);
  assert.match(source, /downloadPdfBlob\(preparedDocument\.blob/);
  assert.match(source, /printPdfBlob\(preparedDocument\.blob/);
  assert.match(source, /role="alert" aria-live="assertive"/);
  assert.doesNotMatch(source, /prepareDocument|functions\.invoke|PDFDocument/);
});

test('abas implementam teclado e associam o tabpanel ao modo ativo', async () => {
  const [navigation, workspace] = await Promise.all([
    readFile(new URL('./components/CarnesModeNavigation.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./components/CarnesWorkspace.tsx', import.meta.url), 'utf8'),
  ]);
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
    assert.match(navigation, new RegExp(`event\\.key === '${key}'`));
  }
  assert.match(navigation, /tabIndex=\{active \? 0 : -1\}/);
  assert.match(navigation, /aria-controls="carnes-alunos-workspace"/);
  assert.match(workspace, /role="tabpanel"/);
  assert.match(workspace, /aria-labelledby=\{`carnes-mode-tab-\$\{controller\.mode\}`\}/);
});
