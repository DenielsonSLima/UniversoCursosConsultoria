import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { scheduleEntry, scheduleFixture, scheduleIo } from './curriculum-days.ui.fixture.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(directory, '../../..');
const dependencies = process.env.ALUNO_UI_NODE_MODULES;
const requireTool = createRequire(dependencies
  ? pathToFileURL(resolve(dependencies, '../curriculum-runner.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const { chromium } = requireTool('playwright');
const postcss = requireTool('postcss');
const tailwindcss = requireTool('tailwindcss');
const artifacts = process.env.ALUNO_GRADE_ARTIFACTS || '/tmp/aluno-curriculum-days';
let browser;
let javascript;
let css;

before(async () => {
  const result = await build({
    stdin: { contents: scheduleEntry, loader: 'tsx', resolveDir: directory },
    bundle: true, format: 'iife', write: false, nodePaths: dependencies ? [dependencies] : [],
    plugins: [{ name: 'controlled-schedule-io', setup(plugin) {
      plugin.onResolve({ filter: /\/lib\/supabase$/ }, () => ({ path: 'database', namespace: 'schedule-io' }));
      plugin.onLoad({ filter: /.*/, namespace: 'schedule-io' }, () => ({ contents: scheduleIo }));
    } }],
  });
  javascript = result.outputFiles[0].text;
  const config = requireTool(resolve(root, 'tailwind.config.cjs'));
  const styles = (await readFile(resolve(root, 'styles.css'), 'utf8')).replace(/^@import.*$/gm, '');
  css = (await postcss([tailwindcss({ ...config, content: [
    resolve(directory, 'components/turma-detail/*.tsx'), resolve(directory, 'components/QueryStateNotice.tsx'),
  ] })]).process(styles, { from: resolve(root, 'styles.css') })).css;
  await mkdir(artifacts, { recursive: true });
  browser = await chromium.launch({ headless: true,
    ...(process.env.ALUNO_UI_BROWSER_EXECUTABLE ? { executablePath: process.env.ALUNO_UI_BROWSER_EXECUTABLE } : {}) });
});
after(async () => { await browser?.close(); });

async function open(fixture = scheduleFixture) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await page.setContent('<!doctype html><html lang="pt-BR"><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(value => window.renderSchedule(value), fixture);
  await page.getByRole('button', { name: /Primeira disciplina/ }).waitFor();
  return page;
}
const first = page => page.getByRole('button', { name: /Primeira disciplina/ });

test('disciplina expande com clique e teclado, mantém datas e sessões sem misturar disciplinas', async () => {
  const page = await open();
  try {
    assert.equal(await first(page).getAttribute('aria-expanded'), 'false');
    assert.equal(await page.getByText('Conteúdo da manhã').count(), 0);
    await first(page).click();
    await page.getByText('Conteúdo da manhã').waitFor();
    assert.equal(await first(page).getAttribute('aria-expanded'), 'true');
    assert.equal(await page.getByText('10/10/2026 • Manhã').count(), 1);
    assert.equal(await page.getByText('10/10/2026 • Tarde').count(), 1);
    assert.equal(await page.getByText('Conteúdo de outra disciplina').count(), 0);
    await first(page).focus();
    await page.keyboard.press('Space');
    assert.equal(await first(page).getAttribute('aria-expanded'), 'false');
    await page.keyboard.press('Enter');
    await page.getByText('Conteúdo da manhã').waitFor();
    await page.screenshot({ path: resolve(artifacts, 'grade-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: resolve(artifacts, 'grade-mobile.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    const requests = await page.evaluate(() => window.scheduleRequests);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].turma_id, 'class-a');
  } finally { await page.close(); }
});

test('carregamento distingue ausência de aulas e não inventa data para aula sem agendamento', async () => {
  const page = await open({ ...scheduleFixture, pending: true, rows: [] });
  try {
    await first(page).click();
    await page.getByRole('status').waitFor();
    assert.equal(await page.getByText('Nenhuma aula cadastrada para esta disciplina.').count(), 0);
    await page.evaluate(() => window.resolveSchedule());
    await page.getByText('Nenhuma aula cadastrada para esta disciplina.').waitFor();
  } finally { await page.close(); }
  const undated = await open({ ...scheduleFixture, rows: [{ ...scheduleFixture.rows[0], data_aula: null, sessao: null }] });
  try {
    await first(undated).click();
    await undated.getByText('Data a definir', { exact: true }).waitFor();
  } finally { await undated.close(); }
});

test('falha de consulta oferece recarregar sem confundir com grade vazia', async () => {
  const page = await open({ ...scheduleFixture, failure: true });
  try {
    await first(page).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByText('Nenhuma aula cadastrada para esta disciplina.').count(), 0);
    await page.evaluate(() => { window.scheduleFixture.failure = false; });
    await page.getByRole('button', { name: 'Recarregar', exact: true }).click();
    await page.getByText('Conteúdo da manhã').waitFor();
  } finally { await page.close(); }
});

test('trocar aluno ou matrícula isola cache, recolhe disciplinas e aguarda a nova consulta', async () => {
  const page = await open();
  try {
    await first(page).click();
    await page.getByText('Conteúdo da manhã').waitFor();
    for (const scope of [
      { ...scheduleFixture.scope, matriculaId: 'enrollment-b' },
      { ...scheduleFixture.scope, alunoId: 'student-b', matriculaId: 'enrollment-b' },
      { ...scheduleFixture.scope, turmaId: 'class-b' },
    ]) {
      await page.evaluate(value => window.renderSchedule(value), { ...scheduleFixture, scope, pending: true, rows: [] });
      await page.waitForFunction(() => document.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded') === 'false');
      await first(page).click();
      await page.getByRole('status').waitFor();
      assert.equal(await page.getByText('Conteúdo da manhã').count(), 0);
      await page.evaluate(() => window.resolveSchedule());
      await page.getByText('Nenhuma aula cadastrada para esta disciplina.').waitFor();
    }
    assert.equal(await page.evaluate(() => window.scheduleRequests.length), 4);
  } finally { await page.close(); }
});

test('resposta de outra turma é rejeitada e escopo desabilitado não consulta', async () => {
  const page = await open({ ...scheduleFixture, rows: [{ ...scheduleFixture.rows[0], turma_id: 'other-class' }] });
  try {
    await first(page).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByText('Conteúdo da manhã').count(), 0);
  } finally { await page.close(); }
  const disabled = await open({ ...scheduleFixture, scope: { ...scheduleFixture.scope, enabled: false } });
  try {
    await first(disabled).click();
    await disabled.getByText('Nenhuma aula cadastrada para esta disciplina.').waitFor();
    assert.equal(await disabled.evaluate(() => window.scheduleRequests.length), 0);
  } finally { await disabled.close(); }
});

test('resposta atrasada da matrícula anterior não aparece após trocar de turma', async () => {
  const page = await open({ ...scheduleFixture, pending: true });
  try {
    await first(page).click();
    await page.getByRole('status').waitFor();
    await page.evaluate(() => { window.resolvePreviousSchedule = window.resolveSchedule; });
    await page.evaluate(value => window.renderSchedule(value), {
      ...scheduleFixture, pending: true, rows: [],
      scope: { ...scheduleFixture.scope, matriculaId: 'next-enrollment', turmaId: 'next-class' },
    });
    await page.waitForFunction(() => window.scheduleRequests.length === 2);
    await first(page).click();
    await page.getByRole('status').waitFor();
    await page.evaluate(rows => {
      window.scheduleFixture.rows = rows;
      window.resolvePreviousSchedule();
      window.scheduleFixture.rows = [];
    }, scheduleFixture.rows);
    assert.equal(await page.getByText('Conteúdo da manhã').count(), 0);
    await page.evaluate(() => window.resolveSchedule());
    await page.getByText('Nenhuma aula cadastrada para esta disciplina.').waitFor();
  } finally { await page.close(); }
});
