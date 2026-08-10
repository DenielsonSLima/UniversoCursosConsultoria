import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageSource = await readFile(new URL('./PlanoCursoPage.tsx', import.meta.url), 'utf8');
const portalSource = await readFile(new URL('../professor.page.tsx', import.meta.url), 'utf8');

test('barra de estado e ações permanece no fluxo normal da página', () => {
  assert.doesNotMatch(pageSource, /sticky top-3 z-20/);
  assert.match(
    pageSource,
    /<header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/,
  );
});

test('folha editável reutiliza cabeçalho e marca d’água institucionais', () => {
  const watermarkIndex = pageSource.indexOf('<ReportWatermark');
  const contentIndex = pageSource.indexOf('<div className="absolute inset-0 z-10">', watermarkIndex);
  const headerIndex = pageSource.indexOf('<DocumentHeader', contentIndex);

  assert.ok(watermarkIndex >= 0, 'ReportWatermark deve compor a camada de fundo');
  assert.ok(contentIndex > watermarkIndex, 'o conteúdo deve ficar acima da marca d’água');
  assert.ok(headerIndex > contentIndex, 'DocumentHeader deve abrir o conteúdo institucional');
});

test('editor divide a identificação e os dias em folhas A4 independentes', () => {
  assert.match(pageSource, /data-plano-curso-page=\{pageNumber\}/);
  assert.match(pageSource, /sm:aspect-\[210\/297\]/);
  assert.match(pageSource, /diasPaginas\.map\(\(diasPagina, pageIndex\)/);
  assert.match(pageSource, /pageNumber=\{pageNumber\}/);
  assert.match(pageSource, /Página \{pageNumber\} de \{totalPages\}/);
});

test('portal entrega ao editor os dados visuais da unidade autorizada', () => {
  for (const field of [
    'logo_url',
    'endereco',
    'telefone',
    'watermark_url',
    'watermark_opacity',
    'watermark_scale',
    'watermark_rotate',
  ]) {
    assert.match(portalSource, new RegExp(`\\b${field}\\b`));
  }

  assert.match(portalSource, /polo=\{currentPolo\}/);
});
