import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const rootRequire = createRequire(join(process.env.UNIVERSO_WORKSPACE || process.cwd(), 'package.json'));
const { build } = rootRequire('esbuild');
const { JSDOM } = rootRequire(process.env.CYCLE_WARNING_JSDOM_PATH || 'jsdom');
const React = rootRequire('react');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://synthetic.test' });
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'MutationObserver']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = rootRequire('react-dom/client');
const { QueryClient, QueryClientProvider, timeoutManager } = await import(pathToFileURL(rootRequire.resolve('@tanstack/react-query')).href);
timeoutManager.setTimeoutProvider({
  setTimeout(callback, delay) { const timer = setTimeout(callback, delay); timer.unref?.(); return timer; },
  clearTimeout, setInterval(callback, delay) { const timer = setInterval(callback, delay); timer.unref?.(); return timer; }, clearInterval,
});
const base = dirname(new URL(import.meta.url).pathname);
const output = mkdtempSync(join(tmpdir(), 'manual-progress-dom-'));
const bundle = join(output, 'runtime.mjs');
await build({
  stdin: { contents: `export { default as Live } from './FinanceiroCicloManualLiveProgress'; export { useGerarCicloFinanceiroTecnicoManual as useGenerate } from './hooks/useMatriculaTecnicaCicloManual';`, resolveDir: base, loader: 'ts' },
  outfile: bundle, bundle: true, format: 'esm', platform: 'node', packages: 'external',
  plugins: [{ name: 'synthetic-only-io', setup(b) {
    b.onResolve({ filter: /^(?:react(?:-dom)?(?:\/.*)?|@tanstack\/react-query)$/ }, a => ({ path: rootRequire.resolve(a.path), external: true }));
    b.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'io', namespace: 'synthetic' }));
    b.onResolve({ filter: /matricula-tecnica-ciclo-manual\.service$/ }, () => ({ path: 'command', namespace: 'synthetic' }));
    b.onResolve({ filter: /^lucide-react$/ }, () => ({ path: 'icons', namespace: 'synthetic' }));
    b.onLoad({ filter: /.*/, namespace: 'synthetic' }, a => ({ contents:
      a.path === 'io' ? `export const supabase={rpc:(name,args)=>({abortSignal:(signal)=>globalThis.__cycleIO.read(name,args,signal)})};`
      : a.path === 'command' ? `export const matriculaTecnicaCicloManualService={generate:input=>globalThis.__cycleIO.send(input),resume:input=>globalThis.__cycleIO.send(input),preview:()=>{throw Error('Unexpected preview')}};`
      : `export const Clock3=()=>null,FileCheck2=()=>null,Landmark=()=>null,Loader2=()=>null,ReceiptText=()=>null,ShieldCheck=()=>null,CheckCircle2=()=>null,AlertTriangle=()=>null;`, loader: 'js' }));
  } }],
});
const { Live, useGenerate } = await import(pathToFileURL(bundle).href);
const identity = { matriculaId: 'matricula-sintetica', turmaId: 'turma-sintetica', cicloNumero: 1, requestId: 'operacao-sintetica' };
const observation = (issued = 0) => ({
  ...identity, versao: 1, encontrado: true, observadoEm: '2026-10-27T22:00:00Z',
  ciclo: { numero: 1, quantidadeItens: 3, quantidadeBancaria: 2, quantidadeLocal: 1, total: '300.00',
    status: issued === 2 ? 'EMITIDO_BANESE' : 'EMISSAO_PARCIAL', emitidosBanese: issued, pendentesEmissao: 2 - issued, emRevisao: 0,
    recebiveis: [0, 1, 2].map(i => ({ id: `item-${i}`, chave: `chave-${i}`, tipo: i ? 'PARCELA' : 'MATRICULA', numero: i,
      descricao: 'Item fictício', valor: '100.00', vencimento: '2027-01-20', status: 'PENDENTE',
      destinoCobranca: i ? 'BANESE' : 'LOCAL', localSemBoletoComprovado: i === 0,
      emissaoBanese: i === 0 ? 'NAO_APLICAVEL' : i <= issued ? 'EMITIDO' : 'PENDENTE' })) },
});
const settle = async (ms = 0) => React.act(async () => { await new Promise(r => setTimeout(r, ms)); });
let host, renderer, client;
const mount = async (element) => {
  host = document.createElement('div'); document.body.append(host); renderer = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  await React.act(async () => renderer.render(React.createElement(QueryClientProvider, { client }, element)));
  await settle(20);
};
const cleanup = async () => {
  await React.act(async () => renderer?.unmount()); client?.clear(); host?.remove(); renderer = null;
};
const live = (extra = {}) => React.createElement(Live, { ...identity, alunoNome: 'Aluno sintético', matriculaExibicao: 'TESTE',
  quantidadeItens: 3, quantidadeBancaria: 2, total: '300.00', onClose: () => {}, ...extra });

test('reabrir acompanhamento sem mutation ativa continua consultando até confirmação bancária, sem POST', async () => {
  let reads = 0, sends = 0, current = observation(0);
  globalThis.__cycleIO = { read: async () => { reads++; return { data: current, error: null }; }, send: () => { sends++; throw Error('No POST allowed'); } };
  try {
    await mount(live());
    assert.match(host.textContent, /0\/2 títulos emitidos/);
    current = observation(1);
    await settle(2_200);
    assert.match(host.textContent, /1\/2 títulos emitidos/);
    current = observation(2);
    await settle(2_200);
    assert.match(host.textContent, /2\/2 títulos emitidos/);
    const terminalReads = reads;
    await settle(2_200);
    assert.equal(reads, terminalReads, 'estado final interrompe as consultas automáticas');
    assert.ok(reads >= 2, 'a consulta não pode depender de uma mutation perdida no reload');
    assert.equal(sends, 0);
    assert.doesNotMatch(host.textContent, /0\/0/);
  } finally { await cleanup(); }
});

test('POST sem resposta é reconciliado por GET na mesma chave e preserva LOCAL fora dos boletos', async () => {
  let reads = 0, sends = 0, current = observation(0), result;
  globalThis.__cycleIO = { read: async () => { reads++; return { data: current, error: null }; }, send: () => { sends++; return new Promise(() => {}); } };
  function Harness() {
    const mutation = useGenerate();
    return React.createElement(React.Fragment, null,
      React.createElement('button', { onClick: () => mutation.mutate({ ...identity, primeiroVencimento: null, revisao: null }, { onSuccess: value => { result = value; } }) }, 'Emitir simulado'),
      live(), React.createElement('span', { 'data-pending': true }, String(mutation.isPending)));
  }
  try {
    await mount(React.createElement(Harness));
    const invalidations = [];
    const invalidate = client.invalidateQueries.bind(client);
    client.invalidateQueries = (filters, options) => { invalidations.push(filters.queryKey); return invalidate(filters, options); };
    await React.act(async () => host.querySelector('button').click());
    current = observation(2);
    await settle(2_200);
    assert.equal(sends, 1);
    assert.equal(result?.confirmadoPorConsulta, true);
    assert.equal(result?.ciclo.emitidosBanese, 2);
    assert.equal(result?.ciclo.quantidadeLocal, 1);
    assert.equal(invalidations.filter(key => key?.[0] === 'matricula-tecnica-financeiro' && key?.[2] === identity.turmaId).length, 1, 'a mutation já reconcilia a turma; a tela não repete essa atualização');
    assert.equal(host.querySelector('[data-pending]').textContent, 'false');
    assert.ok(reads >= 2);
    assert.ok(reads <= 3, 'observer da mutation e tela não devem duplicar o polling periódico');
    assert.match(host.textContent, /2\/2 títulos emitidos/);
  } finally { await cleanup(); }
});

test('erro de leitura mantém último progresso e consulta manual pode confirmar sem POST', async () => {
  let current = observation(1), fail = false, sends = 0;
  globalThis.__cycleIO = { read: async () => fail ? {data:null,error:{message:'Falha sintética'}} : {data:current,error:null}, send: () => { sends++; } };
  try {
    await mount(live());
    assert.match(host.textContent, /1\/2 títulos emitidos/);
    fail = true;
    await React.act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Consultar progresso').click());
    await settle(20);
    assert.match(host.textContent, /1\/2 títulos emitidos/);
    assert.match(host.querySelector('[role=alert]').textContent, /Não foi possível atualizar/);
    fail = false; current = observation(2);
    await React.act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Consultar progresso').click());
    await settle(20);
    assert.match(host.textContent, /2\/2 títulos emitidos/);
    assert.equal(sends, 0);
  } finally { await cleanup(); }
});

test('revisão bancária interrompe consulta automática sem declarar conclusão', async () => {
  let reads = 0;
  const current = observation(0); current.ciclo.emRevisao = 1; current.ciclo.pendentesEmissao = 1;
  globalThis.__cycleIO = { read: async () => { reads++; return {data:current,error:null}; }, send: () => { throw Error('No POST'); } };
  try {
    await mount(live());
    await settle(2_200);
    assert.equal(reads, 1);
    assert.match(host.textContent, /Há títulos em revisão/);
    assert.match(host.textContent, /ciclo em revisão/);
    assert.doesNotMatch(host.textContent, /Gerando e emitindo/);
    assert.doesNotMatch(host.textContent, /Emissão concluída/);
  } finally { await cleanup(); }
});

test('prazo do acompanhamento pausa apenas a consulta automática e conserva consulta manual', async () => {
  let reads = 0;
  globalThis.__cycleIO = { read: async () => { reads++; return {data:observation(0),error:null}; }, send: () => { throw Error('No POST'); } };
  try {
    await mount(live({startedAt:Date.now()-180_001}));
    await settle(2_200);
    assert.equal(reads, 1);
    assert.match(host.textContent, /acompanhamento automático foi pausado/);
    assert.match(host.textContent, /Acompanhamento do ciclo pausado/);
    assert.doesNotMatch(host.textContent, /Gerando e emitindo/);
    await React.act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Consultar progresso').click());
    assert.equal(reads, 2);
  } finally { await cleanup(); }
});

test('LOCAL exclusivo é registro confirmado sem boleto ou porcentagem bancária', async () => {
  const current = observation(0);
  Object.assign(current.ciclo,{quantidadeItens:1,quantidadeBancaria:0,quantidadeLocal:1,pendentesEmissao:0,status:'EMITIDO_BANESE',recebiveis:[current.ciclo.recebiveis[0]]});
  globalThis.__cycleIO = { read: async () => ({data:current,error:null}), send: () => { throw Error('No POST'); } };
  try {
    await mount(live());
    assert.match(host.textContent,/Registro local confirmado; sem boleto bancário/);
    assert.doesNotMatch(host.textContent,/0\/0|100%|0%/);
    assert.equal(host.querySelector('[role=progressbar]').getAttribute('aria-valuenow'),null);
  } finally { await cleanup(); }
});

test('desmontar o acompanhamento cancela novas consultas automáticas', async () => {
  let reads = 0;
  globalThis.__cycleIO = {read:async()=>{reads++;return {data:observation(0),error:null}},send:()=>{throw Error('No POST')}};
  await mount(live());
  await cleanup();
  const finalReads = reads;
  await settle(2_200);
  assert.equal(reads,finalReads);
});

test('observer de outra matrícula na turma não suspende este acompanhamento', async () => {
  const other = {...identity,matriculaId:'outra-matricula',requestId:'outra-operacao'};
  let current = observation(0), targetReads = 0, resolveSend;
  globalThis.__cycleIO = {read:async (_name,args)=>{
    if(args.p_matricula_id===identity.matriculaId){targetReads++;return{data:current,error:null}}
    return{data:{...observation(0),...other},error:null};
  },send:()=>new Promise(resolve=>{resolveSend=resolve})};
  function Harness(){const mutation=useGenerate();return React.createElement(React.Fragment,null,
    React.createElement('button',{onClick:()=>mutation.mutate(other)},'Outra operação'),live());}
  try{
    await mount(React.createElement(Harness));
    await React.act(async()=>host.querySelector('button').click());
    current=observation(2);
    await settle(2_200);
    assert.match(host.textContent,/2\/2 títulos emitidos/);
    assert.ok(targetReads>=2);
  }finally{resolveSend?.({requestId:other.requestId});await settle(20);await cleanup();}
});

test('preparação e resposta de outro request não viram zero ou conclusão desta operação', async () => {
  let current = {...identity,versao:1,encontrado:false,requestId:null,ciclo:null,observadoEm:'2026-10-27T22:00:00Z'};
  globalThis.__cycleIO={read:async()=>({data:current,error:null}),send:()=>{throw Error('No POST')}};
  try{
    await mount(live());
    assert.match(host.textContent,/Aguardando confirmação do progresso/);
    assert.doesNotMatch(host.textContent,/0\/0|0%|100%/);
    assert.equal(host.querySelector('[role=progressbar]').getAttribute('aria-valuenow'),null);
    current={...observation(2),requestId:'outra-operacao'};
    await React.act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Consultar progresso').click());
    await settle(20);
    assert.match(host.textContent,/Não foi possível atualizar/);
    assert.doesNotMatch(host.textContent,/Emissão concluída|2\/2 títulos emitidos/);
    current=observation(1);
    await React.act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Consultar progresso').click());
    await settle(20);
    assert.match(host.textContent,/1\/2 títulos emitidos/);
  }finally{await cleanup();}
});

test('resposta de comando ambígua seguida de conclusão tardia reconcilia a lista novamente', async () => {
  let current=observation(0), sends=0;
  globalThis.__cycleIO={read:async()=>({data:current,error:null}),send:async()=>{sends++;throw Error('504 sintético')}};
  function Harness(){const mutation=useGenerate();return React.createElement(React.Fragment,null,
    React.createElement('button',{onClick:()=>mutation.mutate(identity)},'Emitir simulado'),live());}
  try{
    await mount(React.createElement(Harness));
    const invalidations=[];const invalidate=client.invalidateQueries.bind(client);
    client.invalidateQueries=(filters,options)=>{invalidations.push(filters.queryKey);return invalidate(filters,options)};
    await React.act(async()=>host.querySelector('button').click());
    await settle(20);
    const classRefreshes=()=>invalidations.filter(key=>key?.[0]==='matricula-tecnica-financeiro'&&key?.[2]===identity.turmaId).length;
    assert.equal(classRefreshes(),1,'o erro reconciliou somente a situação parcial');
    current=observation(2);
    await settle(2_200);
    assert.match(host.textContent,/2\/2 títulos emitidos/);
    assert.equal(classRefreshes(),2,'a conclusão posterior exige atualizar lista e carnê');
    assert.equal(sends,1);
  }finally{await cleanup();}
});

test.after(() => { dom.window.close(); rmSync(output, { recursive: true, force: true }); });
