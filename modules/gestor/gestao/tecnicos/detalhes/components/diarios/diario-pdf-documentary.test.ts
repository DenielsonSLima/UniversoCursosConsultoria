import assert from 'node:assert/strict';
import { composeDiarioPdf, composeDiarioPdfWithManifest } from './diario-pdf.ts';
import { createSnapshot, loadAssets, IDS } from './diario-pdf-server-boundary.fixtures.ts';
import type { DiarioPdfRenderableData } from './diario-pdf.contract.ts';

declare const Deno: { test: (name: string, fn: () => Promise<void>) => void };

const documentaryPreview = (): DiarioPdfRenderableData => {
  const props = createSnapshot();
  return { ...props, gradesMap: { [IDS.student]: {
    ...props.gradesMap[IDS.student], p: null, media_parcial: 9.5, media_final: 9.5, total_faltas: null,
    instrumentos_documentais: [{ sourceKey: 'synthetic-row', grades: [
      { columnOrdinal: 1, category: { raw: 'P' }, value: { raw: '4,4' } },
      { columnOrdinal: 2, category: { raw: 'P' }, value: { raw: '5,0' } },
    ] }],
  } }, documentaryAttendanceMap: { [IDS.student]: { [IDS.session]: 'FJ' } } };
};

const pageCommands = (pdf: Awaited<ReturnType<typeof composeDiarioPdf>>) => (
  pdf.internal as unknown as { pages: string[][] }
).pages.slice(1).map((page) => page.join('\n'));

Deno.test('PDF normal separa P1/P2, preserva médias escritas e marcação documental', async () => {
  const pdf = await composeDiarioPdf(documentaryPreview(), await loadAssets());
  const commands = pageCommands(pdf).join('\n');
  for (const header of ['P1', 'P2']) {
    assert.ok(commands.includes(`(${header}) Tj`), `Coluna ausente: ${header}`);
  }
  for (const unused of ['TI', 'TG', 'S', 'CQ', 'O']) {
    assert.ok(!commands.includes(`(${unused}) Tj`), `Coluna não utilizada: ${unused}`);
  }
  assert.ok(commands.includes('(4,4) Tj'));
  assert.ok(commands.includes('(5,0) Tj'));
  assert.ok(commands.includes('(9,5) Tj'));
  assert.ok(commands.includes('(FJ) Tj'));
  assert.ok(!commands.includes('(INSTRUMENTOS AVALIATIVOS) Tj'));
  assert.ok(!commands.includes('P: 4,4 | P: 5,0'));
  assert.ok(!commands.includes('(9,4) Tj'));
  assert.ok(!commands.includes('(null) Tj'));
});

Deno.test('PDF preserva avaliação combinada, zero real e campos ausentes em suas colunas', async () => {
  const props = documentaryPreview();
  props.gradesMap[IDS.student].instrumentos_documentais = [{ sourceKey: 'combined-row', grades: [
    { columnOrdinal: 1, category: { raw: 'P+PP' }, value: { raw: '8,0' } },
    { columnOrdinal: 2, category: { raw: 'TG' }, value: { raw: '0' } },
    { columnOrdinal: 3, category: { raw: 'TI' }, value: { raw: '-' } },
  ] }];
  const commands = pageCommands(await composeDiarioPdf(props, await loadAssets())).join('\n');
  assert.ok(commands.includes('(P+PP) Tj'));
  assert.ok(commands.includes('(8,0) Tj'));
  assert.ok(commands.includes('(0) Tj'));
  assert.ok(commands.includes('(-) Tj'));
  assert.ok(!commands.includes('P+PP: 8,0'));
  // Canonical fixture slots contain 2/1, but documentary missing cells must not fall back to them.
  assert.ok(!commands.includes('(2,0) Tj'));
  assert.ok(!commands.includes('(1,0) Tj'));
});

Deno.test('materialização documental não contorna a validação de snapshot assinado', async () => {
  await assert.rejects(async () => composeDiarioPdfWithManifest(documentaryPreview(), await loadAssets()));
});

Deno.test('PDF não substitui P1/P2 ausentes por nota canônica agregada', async () => {
  const props = documentaryPreview();
  const missingId = 'synthetic-without-source';
  props.students.push({ id: missingId, nome: 'Aluno sem avaliação na fonte', matricula: 'M-002' });
  props.gradesMap[missingId] = { ...createSnapshot().gradesMap[IDS.student], p: 9.17 };
  const commands = pageCommands(await composeDiarioPdf(props, await loadAssets())).join('\n');
  assert.ok(commands.includes('(P1) Tj'));
  assert.ok(commands.includes('(P2) Tj'));
  assert.ok(!commands.includes('(9,17) Tj'));
});

Deno.test('PDF preserva duas casas decimais das notas e médias fornecidas pelo backend', async () => {
  const props = documentaryPreview();
  props.gradesMap[IDS.student] = { ...props.gradesMap[IDS.student],
    media_parcial: 9.05, media_final: 9.13, rec: 9.05,
    instrumentos_documentais: [{ sourceKey: 'precision-row', grades: [
      { columnOrdinal: 1, category: { raw: 'P' }, value: { raw: '5,05' } },
    ] }],
  };
  const commands = pageCommands(await composeDiarioPdf(props, await loadAssets())).join('\n');
  for (const value of ['5,05', '9,05', '9,13']) assert.ok(commands.includes(`(${value}) Tj`));
  assert.ok(!commands.includes('(9,1) Tj'));
  assert.ok(!commands.includes('(5,1) Tj'));
});

Deno.test('PDF normal e em branco exibem somente os instrumentos selecionados', async () => {
  const props = createSnapshot();
  props.activeInstruments = { p: true, ti: false, tg: false, s: false, cq: true, o: false };
  for (const exportMode of ['PREENCHIDO', 'EM_BRANCO'] as const) {
    const pdf = await composeDiarioPdf({ ...props, exportMode }, await loadAssets());
    const commands = pageCommands(pdf).join('\n');
    assert.ok(commands.includes('(P) Tj'));
    assert.ok(commands.includes('(CQ) Tj'));
    for (const unused of ['TI', 'TG', 'S', 'O']) assert.ok(!commands.includes(`(${unused}) Tj`));
  }
});

Deno.test('colunas documentais preservam páginas configuradas e fluxo de PDF em branco', async () => {
  const assets = await loadAssets();
  const [base, documentary, blank] = await Promise.all([
    composeDiarioPdf(createSnapshot(), assets),
    composeDiarioPdf(documentaryPreview(), assets),
    composeDiarioPdf({ ...documentaryPreview(), exportMode: 'EM_BRANCO' }, assets),
  ]);
  assert.equal(base.getNumberOfPages(), documentary.getNumberOfPages());
  assert.deepEqual(pageCommands(base).slice(0, 2), pageCommands(documentary).slice(0, 2));
  assert.ok(!pageCommands(blank).join('\n').includes('(4,4) Tj'));
  assert.ok(!pageCommands(blank).join('\n').includes('(5,0) Tj'));
  for (const header of ['P1', 'P2']) assert.ok(pageCommands(blank).join('\n').includes(`(${header}) Tj`));
  for (const unused of ['TI', 'TG', 'S', 'CQ', 'O']) {
    assert.ok(!pageCommands(blank).join('\n').includes(`(${unused}) Tj`));
  }
});
