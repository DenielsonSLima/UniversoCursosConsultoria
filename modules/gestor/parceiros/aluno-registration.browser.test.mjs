import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createFixture, enrollment, portalStub, supabaseStub } from './aluno-registration.browser.fixture.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../..');
const dependencies = process.env.EAD_UI_NODE_MODULES;
const requireTool = createRequire(dependencies ? pathToFileURL(resolve(dependencies, '../registration-runner.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const { chromium } = requireTool('playwright');
const output = resolve(process.env.ALUNO_REGISTRATION_ARTIFACTS || '/tmp/aluno-registration');
let browser, javascript, css;

before(async () => {
  await mkdir(output, { recursive: true });
  const stubs = {
    rpc: supabaseStub,
    portal: portalStub,
    files: 'export const errorMessage=()=>"Error";export const getFileExtension=()=>"png";',
    validators: 'export const validateAlunoProfessorIdentity=()=>{};',
    documents: 'export const documentosAlunoService={};',
    enrollmentMutations: 'export const parceirosMatriculasService={};',
    toast: 'export const useToast=()=>({toasts:[],removeToast(){},toast:{success(){},error(){}}});export default function Toast(){return null}',
    inactiveTab: 'export default function InactiveTab(){return null}',
    terms: 'export const TERMS_VERSION="test";',
    urls: 'export const buildConfiguredAuthRedirectUrl=path=>"https://portal.test"+path;',
  };
  const result = await build({
    stdin: { contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
      import {QueryClient,QueryClientProvider,useQuery} from '@tanstack/react-query';
      import Card from './components/cards/AlunoCard';
      import Details from './components/viewparceiros/aluno/ParceiroAlunoDetalhes';
      import {parceirosService} from './parceiros.service';
      const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
      function Harness(){const [selected,setSelected]=useState(null);
        const query=useQuery({queryKey:['parceiros','alunos'],queryFn:()=>parceirosService.getAll('alunos')});
        return selected?<Details alunoInicial={selected} onBack={()=>setSelected(null)}/>:<>
          <h1>Alunos</h1>{query.isLoading?<p>Carregando alunos</p>:query.isError?<p>Falha na lista</p>:
          <div style={{maxWidth:420}}>{query.data.map(row=><Card key={row.id} data={row} onClick={()=>setSelected(row)}/>)}</div>}
        </>;
      }
      window.reads=[];window.mount=()=>createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><Harness/></QueryClientProvider>);
      window.refreshAcademicViews=()=>Promise.all([
        client.invalidateQueries({queryKey:['parceiros']}),
        client.invalidateQueries({queryKey:['parceiro',window.fixture.partners[0].id,'matricula-atual']})
      ]);`, loader: 'tsx', resolveDir: directory },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', nodePaths: dependencies ? [dependencies] : [],
    define: { 'import.meta.env': '{}' }, plugins: [{ name: 'controlled-io-and-unopened-tabs', setup(plugin) {
      const map = [
        [/lib\/supabase$/, 'rpc'], [/portal-activation\.service$/, 'portal'],
        [/utils\/file-utils$/, 'files'], [/utils\/parceiro-validators$/, 'validators'],
        [/documentos-aluno\.service$/, 'documents'], [/parceiros-matriculas\.service$/, 'enrollmentMutations'],
        [/shared\/ToastNotification$/, 'toast'], [/shared\/constants\/terms$/, 'terms'], [/lib\/app-url$/, 'urls'],
        [/\/(ParceiroAlunoDados|ParceiroAlunoCursos|ParceiroAlunoMatriculas|ParceiroAlunoDocumentos|ParceiroAlunoFinanceiro|ParceiroAlunoSecretaria|ParceiroAlunoVacinas|AlunoDiscardChangesDialog|GoogleLogo|ConfirmModal)$/, 'inactiveTab'],
      ];
      for (const [filter, name] of map) plugin.onResolve({ filter }, () => ({ path: name, namespace: 'controlled-io' }));
      plugin.onLoad({ filter: /.*/, namespace: 'controlled-io' }, ({ path }) => ({ contents: stubs[path] }));
    } }],
  });
  javascript = result.outputFiles[0].text;
  const config = requireTool(resolve(root, 'tailwind.config.cjs'));
  const styles = (await readFile(resolve(root, 'styles.css'), 'utf8')).replace(/^@import.*$/gm, '');
  css = (await requireTool('postcss')([requireTool('tailwindcss')({ ...config,
    content: [resolve(directory, 'components/**/*.tsx')],
  })]).process(styles, { from: resolve(root, 'styles.css') })).css;
  browser = await chromium.launch({ headless: true, ...(process.env.EAD_UI_BROWSER_EXECUTABLE
    ? { executablePath: process.env.EAD_UI_BROWSER_EXECUTABLE } : { channel: 'chromium' }) });
});
after(async () => { await browser?.close(); });

async function open(fixture = createFixture(), width = 1400) {
  const page = await browser.newPage({ viewport: { width, height: 950 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url() === 'https://portal.test/'
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><body><div id="root"></div></body></html>' })
    : route.abort('blockedbyclient'));
  await page.goto('https://portal.test/');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(value => { window.fixture=value;window.mount(); }, fixture);
  return { page, errors };
}
async function details(page, expected) {
  await page.getByText(expected, { exact: true }).waitFor();
  await page.getByText('Abrir cadastro', { exact: true }).click();
  await page.getByText('Matrícula ' + expected, { exact: true }).waitFor();
}
async function access(page) {
  const mobile = await page.getByLabel('Área do aluno', { exact: true }).isVisible();
  if (mobile) await page.getByLabel('Área do aluno', { exact: true }).selectOption('acesso');
  else await page.getByRole('tab', { name: 'Acesso', exact: true }).click();
  await page.getByText('Acesso ao Sistema', { exact: true }).waitFor();
}
async function assertAccessNumber(page, expected) {
  await page.locator('input[readonly]').first().waitFor();
  assert.equal(await page.locator('input[readonly]').first().inputValue(), expected);
  assert.equal(await page.getByText('UNIV-263551', { exact: true }).count(), 0);
  assert.equal(await page.locator('input[value="UNIV-A-00001000"]').count(), 0);
}

test('card, opened student and access present the same enrollment without a partner-derived or legacy number', async () => {
  const { page, errors } = await open();
  try {
    await page.getByText('UNIV-265889', { exact: true }).waitFor();
    await page.screenshot({ path: resolve(output, 'card.png') });
    await details(page, 'UNIV-265889');
    await access(page);
    await assertAccessNumber(page, 'UNIV-265889');
    await page.screenshot({ path: resolve(output, 'student-access.png'), fullPage: true });
    assert.deepEqual(errors, []);
    const reads = await page.evaluate(() => window.reads);
    assert.ok(reads.some(row => row.table === 'matriculas'));
    assert.ok(reads.some(row => row.table === 'documentos_templates'));
  } finally { await page.close(); }
});

test('persisted format and enrollment polo remain equal across all three screens on mobile', async () => {
  const fixture = createFixture({ config: {
    matriculaPrefix: 'ESC-', matriculaDigits: 6, yearFormat: 'yyyy', usePoloCode: true,
  }, configDelay: 250 });
  const { page, errors } = await open(fixture, 390);
  try {
    await details(page, 'ESC-202602005889');
    await access(page);
    await assertAccessNumber(page, 'ESC-202602005889');
    const box = await page.locator('input[readonly]').first().boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390, 'Access registration stays inside the mobile viewport.');
    await page.screenshot({ path: resolve(output, 'student-access-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a new cancelled course does not replace the active registration', async () => {
  const recent = { ...structuredClone(enrollment), id: '10000000-0000-4000-8000-00000000270f', status: 'CANCELADO', data_matricula: '2026-10-01' };
  const { page, errors } = await open(createFixture({ enrollments: [recent, structuredClone(enrollment)] }));
  try {
    await details(page, 'UNIV-265889');
    await access(page);
    await assertAccessNumber(page, 'UNIV-265889');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('reloading academic data updates card, header and access together after primary enrollment changes', async () => {
  const next = { ...structuredClone(enrollment), id: '10000000-0000-4000-8000-00000000270f', data_matricula: '2026-10-01' };
  const { page, errors } = await open();
  try {
    await details(page, 'UNIV-265889');
    await access(page);
    await assertAccessNumber(page, 'UNIV-265889');
    await page.evaluate(async value => { window.fixture.enrollments.push(value);await window.refreshAcademicViews(); }, next);
    await page.getByText('Matrícula UNIV-269999', { exact: true }).waitFor();
    await assertAccessNumber(page, 'UNIV-269999');
    await page.getByRole('button', { name: 'Voltar para parceiros', exact: true }).click();
    await page.getByText('UNIV-269999', { exact: true }).waitFor();
    assert.equal(await page.getByText('UNIV-265889', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a student without enrollment never receives a number computed from the partner UUID', async () => {
  const { page, errors } = await open(createFixture({ enrollments: [] }));
  try {
    await page.getByText('Abrir cadastro', { exact: true }).waitFor();
    assert.equal(await page.getByText('UNIV-263551', { exact: true }).count(), 0);
    await page.getByText('Abrir cadastro', { exact: true }).click();
    await page.getByText(/Sem matrícula acadêmica/).waitFor();
    await access(page);
    assert.equal(await page.getByText('UNIV-263551', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('failed configuration cannot silently display a number from defaults', async () => {
  const { page, errors } = await open(createFixture({ configError: true }));
  try {
    await page.getByText('Falha na lista', { exact: true }).waitFor();
    assert.equal(await page.getByText('UNIV-265889', { exact: true }).count(), 0);
    assert.equal(await page.getByText('UNIV-263551', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('enrollment read failure in the opened student does not substitute the legacy access alias', async () => {
  const { page, errors } = await open();
  try {
    await page.getByText('UNIV-265889', { exact: true }).waitFor();
    await page.evaluate(() => { window.fixture.enrollmentError = true; });
    await page.getByText('Abrir cadastro', { exact: true }).click();
    await page.getByText('Matrícula indisponível', { exact: true }).first().waitFor();
    await access(page);
    assert.equal(await page.locator('input[value="UNIV-A-00001000"]').count(), 0);
    assert.equal(await page.locator('input[value="UNIV-265889"]').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
