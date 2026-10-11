import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import { build } from 'esbuild';

const component = resolve('modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetalhes.tsx');
const directory = await mkdtemp(resolve(tmpdir(), 'universo-cadastro-hydration-'));
after(() => rm(directory, { recursive: true, force: true }));
const bundle = await build({
  stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `
    import Details from ${JSON.stringify(component)};
    import { fixture } from 'hydration-fixture';
    export { fixture };
    export { normalizeAlunoFormData } from './modules/gestor/parceiros/components/viewparceiros/aluno/parceiro-aluno-dados.utils';
    export { prepareAlunoSaveData } from './modules/gestor/parceiros/components/viewparceiros/aluno/parceiro-aluno-edicao';
    export const render = (alunoInicial) => {
      fixture.cursor = 0; fixture.effects = [];
      const tree = Details({ alunoInicial, onBack() {} });
      for (const effect of fixture.effects) effect();
      return tree;
    };
  ` },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'transform',
  tsconfigRaw: { compilerOptions: { jsx: 'react' } }, logLevel: 'silent',
  banner: { js: `import { createRequire } from 'node:module'; const require=createRequire(${JSON.stringify(import.meta.url)});` },
  plugins: [{ name: 'isolated-student-detail', setup(plugin) {
    plugin.onResolve({ filter: /^hydration-fixture$/ }, () => ({ path: 'react', namespace: 'hydration' }));
    plugin.onResolve({ filter: /^react$/ }, args => args.importer === component
      ? { path: 'react', namespace: 'hydration' } : undefined);
    plugin.onResolve({ filter: /^@tanstack\/react-query$/ }, args => args.importer === component
      ? { path: 'query', namespace: 'hydration' } : undefined);
    const dependencies = [
      [/parceiros\.service$/, 'service'], [/portal-activation\.service$/, 'portal'],
      [/academicos\.service$/, 'academic'], [/lib\/supabase$/, 'supabase'],
      [/shared\/ToastNotification$/, 'toast'], [/ParceiroAlunoNavigation$/, 'navigation'],
      [/\/(ParceiroAlunoDados|ParceiroAlunoCursos|ParceiroAlunoMatriculas|ParceiroAlunoDocumentos|ParceiroAlunoFinanceiro|ParceiroAlunoSecretaria|ParceiroAlunoVacinas|ParceiroAcesso|AlunoDiscardChangesDialog)$/, 'section'],
    ];
    for (const [filter, name] of dependencies) plugin.onResolve({ filter }, args => ({ path: name === 'section'
      ? args.path.split('/').at(-1) : name, namespace: 'hydration' }));
    plugin.onLoad({ filter: /.*/, namespace: 'hydration' }, ({ path }) => {
      const sources = {
        react: `
          export const fixture = { states: [], deps: [], cursor: 0, effects: [], result: null,
            options: null, mutation: null, client: null, writes: [], getPartner: null, updatePartner: null };
          export const useState = (initial) => {
            const index=fixture.cursor++;
            if (!(index in fixture.states)) fixture.states[index]=typeof initial==='function'?initial():initial;
            return [fixture.states[index], next => { fixture.states[index]=typeof next==='function'
              ?next(fixture.states[index]):next; }];
          };
          export const useRef = initial => { const index=fixture.cursor++;
            return fixture.states[index] ||= { current: initial }; };
          export const useEffect = (setup,deps) => { const index=fixture.cursor++;
            if (!fixture.deps[index] || deps.some((value,i)=>!Object.is(value,fixture.deps[index][i]))) {
              fixture.deps[index]=deps;fixture.effects.push(setup);
            }
          };
          export default { createElement: (type,props,...children)=>({type,props:props||{},children}) };
        `,
        query: `
          import {fixture} from 'hydration-fixture';
          export const useQueryClient=()=>fixture.client;
          export const useQuery=options=>{
            if(options.queryKey.length===2){fixture.options=options;return fixture.result;}
            return { data:null,isPending:false,isError:false };
          };
          export const useMutation=options=>{fixture.mutation=options;
            return {isPending:false,mutateAsync:data=>fixture.mutation.mutationFn(data)};};
        `,
        service: `
          import {fixture} from 'hydration-fixture';
          import {toSnake} from './modules/gestor/parceiros/utils/parceiro-mappers';
          import {validateAlunoProfessorIdentity} from './modules/gestor/parceiros/utils/parceiro-validators';
          export const parceirosService={ getById:id=>fixture.getPartner(id),
            update:async(id,data)=>{validateAlunoProfessorIdentity(data);
              fixture.writes.push({id,payload:toSnake(data)});
              return fixture.updatePartner ? fixture.updatePartner(id,data) : data;} };
        `,
        portal: 'export const portalActivationService={};',
        academic: 'export const DEFAULT_CONFIGS={};export const academicosService={};',
        supabase: 'export const supabase={};',
        toast: 'export const useToast=()=>({toasts:[],removeToast(){},toast:{success(){},error(){}}});export default function Toast(){}',
        navigation: 'export const alunoTabs=[{id:"dados",label:"Cadastro"}];export default function Navigation(){}',
      };
      return { contents: sources[path] || `export default function ${path}(){}`,
        loader: 'js', resolveDir: process.cwd() };
    });
  } }],
});
const bundlePath = resolve(directory, 'detail.mjs');
await writeFile(bundlePath, bundle.outputFiles[0].text);
const ui = await import(pathToFileURL(bundlePath).href);
const { fixture } = ui;
const summary = { id: 'student-a', tipo: 'Aluno', nome: 'ALUNO SINTÉTICO',
  cpf: '52998224725', cnpj: null, status: 'ATIVO', poloId: null };
const full = { ...summary, email: 'aluno@example.invalid', telefone: '79999991234',
  endereco: 'RUA SINTÉTICA', nomeMae: 'FILIAÇÃO SINTÉTICA', dataNascimento: '01/01/2000',
  pcd: true, aceitouTermosUso: true, aceitouTermosUsoEm: '2026-10-11T12:00:00Z',
  termosUsoVersao: 'terms-test', trocaSenhaObrigatoria: false };
const deferred = () => { let resolvePromise; let rejectPromise;
  const promise = new Promise((yes, no) => { resolvePromise=yes;rejectPromise=no; });
  return { promise, resolve:resolvePromise, reject:rejectPromise };
};
const nodes = tree => tree && typeof tree === 'object'
  ? [tree, ...tree.children.flat(Infinity).flatMap(nodes)] : [];
const form = tree => nodes(tree).find(node => node.type?.name === 'ParceiroAlunoDados');
const text = tree => typeof tree === 'string' ? tree : tree && typeof tree === 'object'
  ? tree.children.flat(Infinity).map(text).join(' ') : '';
const render = (observer, selected = summary) => {
  fixture.result = observer.getCurrentResult();
  ui.render(selected);
  return ui.render(selected);
};
function prepare(selected = summary) {
  fixture.states=[];fixture.deps=[];fixture.writes=[];fixture.updatePartner=null;
  fixture.client=new QueryClient({ defaultOptions:{ queries:{ staleTime:300_000, retry:false,
    refetchOnWindowFocus:false } } });
  fixture.result={data:selected};
  ui.render(selected);
  return fixture.client;
}
function observe(client, selected = summary) {
  const observer = new QueryObserver(client, fixture.options);
  const unsubscribe = observer.subscribe(() => {});
  return { observer, close:() => {unsubscribe();client.clear();},
    done:() => client.fetchQuery(fixture.options), selected };
}

test('resumo global em cache fresco não monta formulário nem permite salvar antes da leitura completa', async () => {
  const client=prepare();
  client.setQueryData(['parceiro', summary.id], summary);
  const pending=deferred();let reads=0;
  fixture.getPartner=()=>{reads+=1;return pending.promise;};
  const session=observe(client);
  try {
    const tree=render(session.observer);
    assert.equal(form(tree), undefined);
    assert.match(text(tree), /Carregando cadastro/);
    assert.equal(reads, 1);
    await assert.rejects(fixture.mutation.mutationFn({ ...summary, observacao:'TESTE' }), /carregamento completo/);
    assert.deepEqual(fixture.writes, []);
    pending.resolve(full);await session.done();
    const hydrated=render(session.observer);
    assert.deepEqual(form(hydrated).props.aluno, full);
  } finally { session.close(); }
});

test('resumo apenas no cabeçalho e dados completos no formulário preservam campos e termos ao salvar', async () => {
  const client=prepare();
  const pending=deferred();fixture.getPartner=()=>pending.promise;
  const session=observe(client);
  try {
    assert.equal(form(render(session.observer)), undefined);
    pending.resolve(full);await session.done();
    const mounted=form(render(session.observer));
    const baseline=ui.normalizeAlunoFormData(mounted.props.aluno);
    await mounted.props.onChange(ui.prepareAlunoSaveData({ ...baseline, observacao:'ATUALIZADA' }, baseline));
    const saved=fixture.writes[0];
    assert.equal(saved.id, full.id);
    for(const [field,value] of Object.entries({email:full.email,endereco:full.endereco,
      nome_mae:full.nomeMae,pcd:true,aceitou_termos_uso:true,
      aceitou_termos_uso_em:full.aceitouTermosUsoEm,termos_uso_versao:full.termosUsoVersao})) {
      assert.equal(saved.payload[field],value,field);
    }
  } finally { session.close(); }
});

test('falha de hidratação mantém resumo sem formulário e nova tentativa precisa de resposta completa', async () => {
  const client=prepare();client.setQueryData(['parceiro', summary.id],summary);
  fixture.getPartner=async()=>{throw new Error('Leitura indisponível');};
  const session=observe(client);
  try {
    await assert.rejects(session.done(), /Leitura indisponível/);
    const tree=render(session.observer);
    assert.equal(form(tree),undefined);
    assert.match(text(tree),/Não foi possível carregar o cadastro/);
    const retry=nodes(tree).find(node=>node.type==='button' && /Tentar novamente/.test(text(node)));
    assert.ok(retry);
    const pending=deferred();fixture.getPartner=()=>pending.promise;
    retry.props.onClick();
    assert.equal(form(render(session.observer)),undefined);
    pending.resolve(full);await session.done();
    assert.equal(form(render(session.observer)).props.aluno.id,summary.id);
  } finally { session.close(); }
});

test('trocar aluno bloqueia cache parcial do novo id e rejeita rascunho do aluno anterior', async () => {
  const client=prepare();fixture.getPartner=async()=>full;
  const first=observe(client);
  let second;
  try {
    await first.done();
    const previous=form(render(first.observer));
    const nextSummary={...summary,id:'student-b',nome:'OUTRO ALUNO SINTÉTICO'};
    const nextFull={...full,...nextSummary,email:'outro@example.invalid'};
    client.setQueryData(['parceiro', nextSummary.id],nextSummary);
    const pending=deferred();fixture.getPartner=()=>pending.promise;
    assert.equal(form(render(first.observer,nextSummary)),undefined);
    second=observe(client,nextSummary);
    assert.equal(form(render(second.observer,nextSummary)),undefined);
    pending.resolve(nextFull);await second.done();
    assert.deepEqual(form(render(second.observer,nextSummary)).props.aluno,nextFull);
    await assert.rejects(previous.props.onChange(full), /aluno selecionado/);
    assert.deepEqual(fixture.writes,[]);
  } finally { second?.close();first.close(); }
});

test('refetch pendente ou falho após hidratação não desmonta formulário e rascunho em edição', async () => {
  const client=prepare();fixture.getPartner=async()=>full;
  const session=observe(client);
  try {
    await session.done();assert.ok(form(render(session.observer)));
    const pending=deferred();fixture.getPartner=()=>pending.promise;
    const refreshing=session.observer.refetch();
    assert.ok(form(render(session.observer)));
    pending.reject(new Error('Refetch indisponível'));
    await refreshing;
    assert.ok(form(render(session.observer)));
  } finally { session.close(); }
});

test('UPDATE atrasado do aluno anterior grava sua própria chave sem contaminar cache do aluno exibido', async () => {
  const client=prepare();fixture.getPartner=async()=>full;
  const first=observe(client);
  let second;
  try {
    await first.done();render(first.observer);
    const updated={...full,observacao:'ALTERAÇÃO DO ALUNO A'};
    const pending=deferred();const started=deferred();
    fixture.updatePartner=()=>{started.resolve();return pending.promise;};
    const mutation=new MutationObserver(client,fixture.mutation);
    const saving=mutation.mutate(updated);
    await started.promise;
    const nextSummary={...summary,id:'student-b',nome:'OUTRO ALUNO SINTÉTICO'};
    const nextFull={...full,...nextSummary,email:'outro@example.invalid'};
    fixture.getPartner=async()=>nextFull;
    render(first.observer,nextSummary);
    second=observe(client,nextSummary);
    await second.done();render(second.observer,nextSummary);
    mutation.setOptions(fixture.mutation);
    pending.resolve(updated);await saving;
    assert.deepEqual(client.getQueryData(['parceiro',summary.id]),updated);
    assert.deepEqual(client.getQueryData(['parceiro',nextSummary.id]),nextFull);
    assert.deepEqual(form(render(second.observer,nextSummary)).props.aluno,nextFull);
  } finally { second?.close();first.close(); }
});

test('resposta divergente de UPDATE é recusada sem substituir cadastro em cache', async () => {
  for(const invalid of [{...full,id:'another-id'},{...full,tipo:'Professor'}]) {
    const client=prepare();fixture.getPartner=async()=>full;
    const session=observe(client);
    try {
      await session.done();render(session.observer);
      fixture.updatePartner=async()=>invalid;
      await assert.rejects(fixture.mutation.mutationFn(full),/resposta da atualização/);
      assert.deepEqual(client.getQueryData(['parceiro',summary.id]),full);
    } finally { session.close(); }
  }
});

test('resposta com identidade ou tipo divergente não é aceita como cadastro completo', async () => {
  for(const invalid of [{...full,id:'another-id'},{...full,tipo:'Professor'}]) {
    const client=prepare();fixture.getPartner=async()=>invalid;
    const session=observe(client);
    try {
      await assert.rejects(session.done(), /aluno selecionado/);
      assert.equal(form(render(session.observer)),undefined);
      assert.deepEqual(fixture.writes,[]);
    } finally { session.close(); }
  }
});
