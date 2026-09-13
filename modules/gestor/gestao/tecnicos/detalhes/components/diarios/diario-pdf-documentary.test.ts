import assert from 'node:assert/strict';
import { composeDiarioPdf, composeDiarioPdfWithManifest } from './diario-pdf.ts';
import { createSnapshot, loadAssets, IDS } from './diario-pdf-server-boundary.fixtures.ts';
import type { DiarioPdfRenderableData } from './diario-pdf.contract.ts';

declare const Deno: { test: (name: string, fn: () => Promise<void>) => void };

const documentaryPreview = (): DiarioPdfRenderableData => {
  const props = createSnapshot();
  return { ...props, gradesMap: { [IDS.student]: {
    ...props.gradesMap[IDS.student], p: null, media_parcial: 7.5, media_final: 7.5, total_faltas: null,
    instrumentos_documentais: [{ sourceKey: 'synthetic-row', grades: [
      { columnOrdinal: 1, category: { raw: 'P' }, value: { raw: '7,8' } },
      { columnOrdinal: 2, category: { raw: 'P' }, value: { raw: '8,9' } },
      { columnOrdinal: 3, category: { raw: 'PP' }, value: { raw: '0' } },
    ] }],
  } }, documentaryAttendanceMap: { [IDS.student]: { [IDS.session]: 'FJ' } } };
};

const pageCommands = (pdf: Awaited<ReturnType<typeof composeDiarioPdf>>) => (
  pdf.internal as unknown as { pages: string[][] }
).pages.slice(1).map((page) => page.join('\n'));

Deno.test('PDF normal preserva instrumentos repetidos, médias escritas e marcação documental', async () => {
  const pdf = await composeDiarioPdf(documentaryPreview(), await loadAssets());
  const commands = pageCommands(pdf).join('\n');
  assert.ok(commands.includes('P: 7,8 | P: 8,9 | PP: 0'));
  assert.ok(commands.includes('(7.5) Tj'));
  assert.ok(commands.includes('(FJ) Tj'));
  assert.ok(commands.includes('(INSTRUMENTOS AVALIATIVOS) Tj'));
  assert.ok(!commands.includes('(16.7) Tj'));
  assert.ok(!commands.includes('(null) Tj'));
});

Deno.test('materialização documental não contorna a validação de snapshot assinado', async () => {
  await assert.rejects(async () => composeDiarioPdfWithManifest(documentaryPreview(), await loadAssets()));
});

Deno.test('coluna documental preserva páginas configuradas e fluxo de PDF em branco', async () => {
  const assets = await loadAssets();
  const [base, documentary, blank] = await Promise.all([
    composeDiarioPdf(createSnapshot(), assets),
    composeDiarioPdf(documentaryPreview(), assets),
    composeDiarioPdf({ ...documentaryPreview(), exportMode: 'EM_BRANCO' }, assets),
  ]);
  assert.equal(base.getNumberOfPages(), documentary.getNumberOfPages());
  assert.deepEqual(pageCommands(base).slice(0, 2), pageCommands(documentary).slice(0, 2));
  assert.ok(!pageCommands(blank).join('\n').includes('P: 7,8'));
});
