import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setImmediate } from 'node:timers';

const modules = process.env.EAD_UI_NODE_MODULES || resolve('node_modules');
const { build } = await import(pathToFileURL(join(modules, 'esbuild/lib/main.js')));
const folder = await mkdtemp(join(tmpdir(), 'carteirinha-workspace-'));
const output = join(folder, 'page.mjs');
after(async () => {
  await rm(folder, { recursive: true, force: true });
  delete globalThis.__cardWorkspaceTest;
  delete globalThis.window;
  delete globalThis.alert;
});

// Controlled hooks execute the actual Page and its effect/handler transitions;
// network, presentation children and formatting are outside this state contract.
const react = `
const test = globalThis.__cardWorkspaceTest;
export const useState = initial => {
  const index = test.cursor++;
  if (!(index in test.hooks)) test.hooks[index] = typeof initial === 'function' ? initial() : initial;
  return [test.hooks[index], value => {
    test.hooks[index] = typeof value === 'function' ? value(test.hooks[index]) : value;
    test.dirty = true;
  }];
};
export const useRef = initial => {
  const index = test.cursor++;
  if (!(index in test.hooks)) test.hooks[index] = {current: initial};
  return test.hooks[index];
};
export const useEffect = (run, deps) => {
  const index = test.cursor++;
  const old = test.hooks[index];
  if (!old || deps.some((value, i) => value !== old[i])) test.effects.push(run);
  test.hooks[index] = deps;
};
export default {createElement: (type, props, ...children) => ({type, props: {...props, children}})};
`;
const state = { hooks: [], cursor: 0, effects: [], dirty: false, query: null, resolveIssue: null };
globalThis.__cardWorkspaceTest = state;
globalThis.window = { sessionStorage: { getItem: () => null } };
globalThis.alert = message => { throw new Error(`Unexpected alert: ${message}`); };
const stubs = {
  react,
  'react/jsx-runtime': 'export const jsx = (type, props) => ({type, props}); export const jsxs = jsx;',
  '@tanstack/react-query': 'export const useQuery = () => globalThis.__cardWorkspaceTest.query;',
  'lucide-react': 'export const AlertTriangle = "Alert"; export const Loader2 = "Loader";',
  academicUtils: 'export const formatMatricula = id => `MAT-${id}`;',
  'carteirinha-date-formatters': 'export const formatCarteirinhaDate = value => value;',
  'document-validation.service': `export const createDocumentReissueKey = () => 'request';
    export const documentValidationService = {reissue: ({enrollmentId}) => new Promise(resolve => {
      const test = globalThis.__cardWorkspaceTest;
      if (test.autoIssue) {
        test.issued.push(enrollmentId);
        resolve({code: 'CIE-' + enrollmentId, expiresAt: null, validationPublic: true});
        return;
      }
      globalThis.__cardWorkspaceTest.resolveIssue = resolve;
    })};`,
  'secretaria-carteirinhas.helpers': 'export const TEMPLATE_DEFAULT = {startNumber: 1000};',
  'carteirinha-assets': 'export const preloadCarteirinhaBackgrounds = async () => {};',
  'secretaria-carteirinhas.service': 'export const secretariaCarteirinhasWorkspaceQueryOptions = id => ({id});',
  SecretariaCarteirinhasControls: 'export default "Controls";',
  SecretariaCarteirinhasPrintLayout: 'export default "PrintLayout";',
  'secretaria-search': 'export const matchesSecretariaSearch = () => true;',
  studentIdentityDocument: 'export const resolveStudentIdentityDocument = value => ({number: value.rg});',
};
await build({
  entryPoints: [resolve('modules/gestor/secretaria/carteirinhas/SecretariaCarteirinhasPage.tsx')],
  outfile: output, bundle: true, platform: 'node', format: 'esm', jsx: 'transform',
  plugins: [{name: 'state-contract', setup(builder) {
    builder.onResolve({filter: /.*/}, args => {
      if (args.kind === 'entry-point') return;
      const key = Object.keys(stubs).find(key => args.path === key || args.path.endsWith(`/${key}`));
      if (!key) throw new Error(`Unexpected Page dependency: ${args.path}`);
      return {path: key, namespace: 'stub'};
    });
    builder.onLoad({filter: /.*/, namespace: 'stub'}, args => ({contents: stubs[args.path], loader: 'js'}));
  }}],
});
const { default: Page } = await import(pathToFileURL(output));
const render = () => {
  let result;
  for (let iteration = 0; iteration < 10; iteration += 1) {
    state.cursor = 0; state.effects = []; state.dirty = false;
    result = Page({poloId: 'polo'});
    state.effects.forEach(effect => effect());
    if (!state.dirty) return result;
  }
  throw new Error('Page did not settle after state transitions.');
};
const workspace = (name, color) => ({
  enrollments: [{enrollmentId: name, alunoId: name, alunoNome: name, cpf: '', rg: '',
    turmaId: 'turma', poloId: 'polo', cursoNome: 'Curso', nascimento: '2000-01-01'}],
  classes: [], institutionalData: {}, academicConfig: {}, template: {corPrimaria: color},
});

test('workspace refetch cannot replace an in-flight/open card batch and applies after closing', async () => {
  state.query = {data: workspace('ALUNO ORIGINAL', '#001a33'), isLoading: false, isError: false};
  let view = render();
  assert.equal(view.type, 'Controls');
  view.props.setSelectedAluno(view.props.alunos[0]);
  view = render();
  view.props.onPrintAction();
  view = render();
  assert.equal(view.props.isPreparingValidation, true);

  state.query.data = workspace('NOVO ALUNO', '#ff0000');
  view = render();
  assert.equal(view.props.selectedAluno.nome, 'ALUNO ORIGINAL');
  assert.equal(view.props.alunos[0].nome, 'ALUNO ORIGINAL');

  state.resolveIssue({code: 'CIE-ORIGINAL', expiresAt: '2028-12-31', validationPublic: true});
  await new Promise(resolve => setImmediate(resolve));
  view = render();
  assert.equal(view.type, 'PrintLayout');
  assert.equal(view.props.alunos[0].nome, 'ALUNO ORIGINAL');
  assert.equal(view.props.alunos[0].validationCode, 'CIE-ORIGINAL');
  assert.equal(view.props.templateConfig.corPrimaria, '#001a33');

  state.query = {...state.query, data: workspace('TERCEIRO ALUNO', '#00ff00'), isError: true};
  view = render();
  assert.equal(view.type, 'PrintLayout', 'A background query error must preserve the existing PDF.');
  assert.equal(view.props.alunos[0].nome, 'ALUNO ORIGINAL');
  assert.equal(view.props.templateConfig.corPrimaria, '#001a33');

  state.query.isError = false;
  view.props.onBack();
  view = render();
  assert.equal(view.type, 'Controls');
  assert.equal(view.props.alunos[0].nome, 'TERCEIRO ALUNO');
  assert.equal(view.props.selectedAluno, null);
});

test('all, class and custom batches preserve RPC order across A4 sheets and layouts', async () => {
  // Backend returns alphabetical order, including accents and mixed case.
  const names = ['Ágata', 'ALICE', 'breno', 'CAIO', 'DANIEL', 'Érica',
    'FÁBIO', 'GABRIEL', 'HELENA', 'JAINE', 'KALYNE', 'NATALY', 'ROBERT'];
  for (const layout of ['dobra', 'espelhado']) {
    for (const mode of ['lote', 'turma', 'personalizado']) {
      state.hooks = []; state.autoIssue = true; state.issued = [];
      const data = workspace('unused', '#001a33');
      data.enrollments = names.map((name, index) => ({
        ...data.enrollments[0], enrollmentId: `enrollment-${index}`, alunoId: `student-${index}`,
        alunoNome: name, turmaId: index % 2 === 0 ? 'turma-a' : 'turma-b',
      }));
      // A second enrollment must not change the primary card or duplicate it.
      data.enrollments.splice(1, 0, {...data.enrollments[0], enrollmentId: 'older', turmaId: 'turma-b'});
      state.query = {data, isLoading: false, isError: false};
      let view = render();
      const original = [...view.props.alunos];
      view.props.setMode(mode === 'turma' ? 'lote' : mode);
      view.props.setLayoutType(layout);
      if (mode === 'turma') view.props.setSelectedTurmaId('turma-a');
      if (mode === 'personalizado') view.props.setCustomSelectedAlunos([...original].reverse());
      const expected = original.filter((_, index) => mode !== 'turma' || index % 2 === 0);
      view = render();
      assert.deepEqual(view.props.alunosParaImprimir.map(aluno => aluno.id), expected.map(aluno => aluno.id));
      view.props.onPrintAction();
      await new Promise(resolve => setImmediate(resolve));
      view = render();
      assert.equal(view.type, 'PrintLayout');
      assert.equal(view.props.layoutType, layout);
      assert.deepEqual(view.props.alunos.map(aluno => aluno.nome), expected.map(aluno => aluno.nome));
      assert.deepEqual(state.issued, expected.map(aluno => aluno.enrollmentId));
      assert.ok(view.props.alunos.every(aluno => aluno.validationCode === `CIE-${aluno.enrollmentId}`));
      assert.equal(original[0].enrollmentId, 'enrollment-0');
      assert.equal(view.props.alunos.length, mode === 'turma' ? 7 : 13);
    }
  }
});
